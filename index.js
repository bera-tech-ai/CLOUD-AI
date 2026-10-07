import 'dotenv/config'

import http from 'http'
import fs from 'fs'
import path from 'path'
import axios from 'axios'
import chalk from 'chalk'
import pino from 'pino'
import { MongoClient } from 'mongodb'

import {
    makeWASocket,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    DisconnectReason,
    jidNormalizedUser
} from '@whiskeysockets/baileys'

import {
    handleMessage,
    handleGroupEvents,
    handleAntiDelete,
    handleAntiEdit
} from './Handler.js'

// ============================================================
// CONFIG
// ============================================================

const PORT = process.env.PORT || 3000

const MONGODB_URI = process.env.MONGODB_URI
const MONGODB_DB = process.env.MONGODB_DB || 'cloud_ai'
const MONGODB_COLLECTION = process.env.MONGODB_COLLECTION || 'baileys_auth'
const SESSION_ID = process.env.SESSION_ID || 'cloud-ai-main'

const PAIRING_NUMBER =
    process.env.PAIRING_NUMBER ||
    process.env.OWNER_NUMBER ||
    ''

const logger = pino({ level: 'silent' })

// ============================================================
// GLOBAL STATE
// ============================================================

let mongoClient = null
let authCollection = null

let activeConn = null
let socketGeneration = 0

let reconnectTimer = null
let reconnectAttempts = 0

let isConnecting = false
let shuttingDown = false
let bannerShown = false

let pairingTimer = null
let pairingRequested = false

let botReadyAt = null

global.conn = null
global._conn = null
global.jidPhoneMap = global.jidPhoneMap || {}

// ============================================================
// MONGO HELPERS
// ============================================================

function serializeValue(value) {
    if (value === undefined) {
        return { __type: 'undefined' }
    }

    if (value === null) {
        return null
    }

    if (Buffer.isBuffer(value)) {
        return {
            __type: 'Buffer',
            data: value.toString('base64')
        }
    }

    if (value instanceof Uint8Array) {
        return {
            __type: 'Uint8Array',
            data: Buffer.from(value).toString('base64')
        }
    }

    if (Array.isArray(value)) {
        return value.map(serializeValue)
    }

    if (value instanceof Date) {
        return {
            __type: 'Date',
            data: value.toISOString()
        }
    }

    if (typeof value === 'object') {
        const result = {}

        for (const [key, val] of Object.entries(value)) {
            result[key] = serializeValue(val)
        }

        return result
    }

    return value
}

function deserializeValue(value) {
    if (value === null || value === undefined) {
        return value
    }

    if (typeof value !== 'object') {
        return value
    }

    if (value.__type === 'Buffer') {
        return Buffer.from(value.data, 'base64')
    }

    if (value.__type === 'Uint8Array') {
        return new Uint8Array(
            Buffer.from(value.data, 'base64')
        )
    }

    if (value.__type === 'undefined') {
        return undefined
    }

    if (value.__type === 'Date') {
        return new Date(value.data)
    }

    if (Array.isArray(value)) {
        return value.map(deserializeValue)
    }

    const result = {}

    for (const [key, val] of Object.entries(value)) {
        result[key] = deserializeValue(val)
    }

    return result
}

// ============================================================
// CONNECT MONGO
// ============================================================

async function connectMongo() {
    if (authCollection) {
        return authCollection
    }

    if (!MONGODB_URI) {
        throw new Error(
            'MONGODB_URI is missing. Add it to BeraHost environment variables.'
        )
    }

    console.log(chalk.cyan('🍃 Connecting to MongoDB...'))

    mongoClient = new MongoClient(MONGODB_URI, {
        serverSelectionTimeoutMS: 15000,
        connectTimeoutMS: 15000
    })

    await mongoClient.connect()

    const db = mongoClient.db(MONGODB_DB)

    authCollection = db.collection(MONGODB_COLLECTION)

    await authCollection.createIndex(
        {
            sessionId: 1,
            type: 1,
            key: 1
        },
        {
            unique: true
        }
    )

    console.log(
        chalk.green(`✅ MongoDB connected: ${MONGODB_DB}`)
    )

    return authCollection
}

// ============================================================
// MONGO AUTH STATE
// ============================================================

async function useMongoAuthState(sessionId) {
    const collection = authCollection || await connectMongo()

    let creds = {
        noiseKey: undefined,
        pairingEphemeralKeyPair: undefined,
        signedIdentityKey: undefined,
        signedPreKey: undefined,
        registrationId: undefined,
        advSecretKey: undefined,
        nextPreKeyId: undefined,
        firstUnuploadedPreKeyId: undefined,
        accountSyncCounter: 0,
        accountSettings: [],
        registered: false
    }

    const credsDoc = await collection.findOne({
        sessionId,
        type: 'creds',
        key: 'main'
    })

    if (credsDoc?.value) {
        try {
            creds = deserializeValue(credsDoc.value)

            console.log(
                chalk.green(
                    '🔐 Existing Baileys credentials loaded from MongoDB.'
                )
            )
        } catch (err) {
            console.log(
                chalk.yellow(
                    `⚠️ Could not decode MongoDB credentials: ${err.message}`
                )
            )
        }
    } else {
        console.log(
            chalk.yellow(
                '🔐 No existing Baileys credentials found in MongoDB.'
            )
        )
    }

    const keys = {
        get: async (type, ids) => {
            const result = {}

            if (!ids?.length) {
                return result
            }

            const documents = await collection
                .find({
                    sessionId,
                    type: `key:${type}`,
                    key: {
                        $in: ids
                    }
                })
                .toArray()

            const map = new Map(
                documents.map(doc => [
                    doc.key,
                    deserializeValue(doc.value)
                ])
            )

            for (const id of ids) {
                result[id] = map.get(id)
            }

            return result
        },

        set: async data => {
            const operations = []

            for (const [type, entries] of Object.entries(data || {})) {
                for (const [key, value] of Object.entries(entries || {})) {
                    operations.push({
                        updateOne: {
                            filter: {
                                sessionId,
                                type: `key:${type}`,
                                key
                            },
                            update: {
                                $set: {
                                    sessionId,
                                    type: `key:${type}`,
                                    key,
                                    value: serializeValue(value),
                                    updatedAt: new Date()
                                }
                            },
                            upsert: true
                        }
                    })
                }
            }

            if (operations.length) {
                await collection.bulkWrite(
                    operations,
                    {
                        ordered: false
                    }
                )
            }
        }
    }

    const saveCreds = async () => {
        await collection.updateOne(
            {
                sessionId,
                type: 'creds',
                key: 'main'
            },
            {
                $set: {
                    sessionId,
                    type: 'creds',
                    key: 'main',
                    value: serializeValue(creds),
                    updatedAt: new Date()
                }
            },
            {
                upsert: true
            }
        )
    }

    return {
        state: {
            creds,
            keys
        },
        saveCreds
    }
}

// ============================================================
// CLEAR MONGO SESSION
// ============================================================

async function clearMongoSession() {
    if (!authCollection) return

    await authCollection.deleteMany({
        sessionId: SESSION_ID
    })

    console.log(
        chalk.red(
            '🗑️ Baileys authentication removed from MongoDB.'
        )
    )
}

// ============================================================
// STATUS CODE
// ============================================================

function getDisconnectStatus(error) {
    if (!error) {
        return null
    }

    return (
        error?.output?.statusCode ??
        error?.data?.statusCode ??
        error?.statusCode ??
        error?.status ??
        null
    )
}

// ============================================================
// SOCKET HELPERS
// ============================================================

function clearReconnectTimer() {
    if (reconnectTimer) {
        clearTimeout(reconnectTimer)
        reconnectTimer = null
    }
}

function clearPairingTimer() {
    if (pairingTimer) {
        clearTimeout(pairingTimer)
        pairingTimer = null
    }
}

function isCurrentSocket(conn, generation) {
    return (
        !shuttingDown &&
        activeConn === conn &&
        socketGeneration === generation
    )
}

// ============================================================
// CLOSE SOCKET
// ============================================================

async function closeActiveConnection() {
    const conn = activeConn

    activeConn = null
    global.conn = null
    global._conn = null

    clearPairingTimer()

    if (!conn) {
        return
    }

    try {
        conn.ev.removeAllListeners()
    } catch {}

    try {
        conn.ws?.removeAllListeners?.()
    } catch {}

    try {
        conn.ws?.terminate?.()
    } catch {}

    try {
        conn.end?.()
    } catch {}

    // Important:
    // Give Signal state / WebSocket teardown time to finish
    // before creating another socket.
    await new Promise(resolve => setTimeout(resolve, 1000))
}

// ============================================================
// RECONNECT
// ============================================================

function scheduleReconnect(reason = 'connection closed', delay = null) {
    if (shuttingDown) {
        return
    }

    if (reconnectTimer) {
        return
    }

    reconnectAttempts++

    const calculatedDelay =
        delay ??
        Math.min(
            5000 * Math.pow(1.5, Math.min(reconnectAttempts - 1, 5)),
            30000
        )

    console.log(
        chalk.yellow(
            `🔄 Reconnecting in ${Math.round(calculatedDelay / 1000)}s — ${reason}`
        )
    )

    reconnectTimer = setTimeout(async () => {
        reconnectTimer = null

        if (shuttingDown) {
            return
        }

        await closeActiveConnection()

        try {
            await connectToWhatsApp()
        } catch (err) {
            console.error(
                chalk.red(
                    `[RECONNECT] ${err.message}`
                )
            )

            scheduleReconnect(
                'reconnect attempt failed'
            )
        }
    }, calculatedDelay)
}

// ============================================================
// BANNER
// ============================================================

function printBanner() {
    if (bannerShown) {
        return
    }

    bannerShown = true

    console.log('')
    console.log(
        chalk.greenBright(
            '╔══════════════════════════════════╗'
        )
    )
    console.log(
        chalk.greenBright(
            '║          ℂ𝕃𝕆𝕌𝔻 𝔸𝕀             ║'
        )
    )
    console.log(
        chalk.greenBright(
            '║      WhatsApp Multi-Device      ║'
        )
    )
    console.log(
        chalk.greenBright(
            '║          by 𝔹𝔼ℝ𝔸              ║'
        )
    )
    console.log(
        chalk.greenBright(
            '╚══════════════════════════════════╝'
        )
    )
    console.log('')
}

// ============================================================
// PAIRING NUMBER
// ============================================================

function normalizePhoneNumber(number) {
    return String(number || '')
        .replace(/[^0-9]/g, '')
        .trim()
}

function getPairingNumber() {
    const number = normalizePhoneNumber(PAIRING_NUMBER)

    if (!number || number.length < 7) {
        return null
    }

    return number
}

function showPairingCode(code) {
    const formatted =
        String(code)
            .match(/.{1,4}/g)
            ?.join('-') || code

    console.log('')
    console.log(
        chalk.green(
            '┌──────────────────────────────────────────┐'
        )
    )

    console.log(
        chalk.green('│') +
        chalk.white.bold(
            `   PAIRING CODE: ${formatted}`
        ) +
        chalk.green(' │')
    )

    console.log(
        chalk.green(
            '├──────────────────────────────────────────┤'
        )
    )

    console.log(
        chalk.green(
            '│  WhatsApp → Settings → Linked Devices    │'
        )
    )

    console.log(
        chalk.green(
            '│  → Link a Device → Link with phone      │'
        )
    )

    console.log(
        chalk.green(
            '│  number instead → enter the code         │'
        )
    )

    console.log(
        chalk.green(
            '└──────────────────────────────────────────┘'
        )
    )

    console.log('')
}

// ============================================================
// REQUEST PAIRING CODE
// ============================================================

async function requestPairingCode(
    conn,
    generation,
    state,
    phoneNumber
) {
    if (!isCurrentSocket(conn, generation)) {
        return
    }

    // Already registered — never request a pairing code.
    if (state.creds.registered) {
        return
    }

    if (!phoneNumber) {
        console.log(
            chalk.red(
                '❌ No valid pairing number configured.'
            )
        )
        return
    }

    if (pairingRequested) {
        return
    }

    pairingRequested = true

    console.log(
        chalk.cyan(
            '🔐 Requesting WhatsApp pairing code...'
        )
    )

    try {
        const code = await conn.requestPairingCode(
            phoneNumber
        )

        if (!isCurrentSocket(conn, generation)) {
            return
        }

        showPairingCode(code)

    } catch (err) {
        pairingRequested = false

        console.log(
            chalk.yellow(
                `⚠️ Pairing code request failed: ${err.message}`
            )
        )

        /*
         * IMPORTANT:
         *
         * Do NOT delete MongoDB credentials here.
         * A "Connection Closed" during pairing is not
         * proof that the WhatsApp account was logged out.
         *
         * The connection.update close handler will deal
         * with the actual disconnect.
         */
    }
}

// ============================================================
// START BOT
// ============================================================

async function connectToWhatsApp() {
    if (shuttingDown) {
        return
    }

    if (isConnecting) {
        return
    }

    if (activeConn) {
        return
    }

    isConnecting = true

    clearReconnectTimer()
    clearPairingTimer()

    pairingRequested = false

    const generation = ++socketGeneration

    try {
        printBanner()

        const { state, saveCreds } =
            await useMongoAuthState(SESSION_ID)

        const { version } =
            await fetchLatestBaileysVersion()

        const phoneNumber =
            getPairingNumber()

        const wasRegisteredAtSocketStart =
            Boolean(state.creds.registered)

        if (!wasRegisteredAtSocketStart) {
            console.log(
                chalk.cyan(
                    `📱 Pairing number: ${phoneNumber || 'NOT CONFIGURED'}`
                )
            )
        } else {
            console.log(
                chalk.green(
                    '🔐 Registered Baileys session detected.'
                )
            )
        }

        console.log(
            chalk.gray(
                `📦 WhatsApp Web version: ${version.join('.')}`
            )
        )

        const conn = makeWASocket({
            version,

            logger,

            auth: {
                creds: state.creds,

                keys: makeCacheableSignalKeyStore(
                    state.keys,
                    logger
                )
            },

            printQRInTerminal: false,

            browser: [
                'Ubuntu',
                'Chrome',
                '22.0.0'
            ],

            markOnlineOnConnect: true,

            syncFullHistory: false,

            generateHighQualityLinkPreview: false,

            keepAliveIntervalMs: 20000,

            /*
             * Give the socket enough time to establish.
             * This reduces false 408 timeouts.
             */
            connectTimeoutMs: 90000,

            defaultQueryTimeoutMs: 30000,

            retryRequestDelayMs: 250,

            maxMsgRetryCount: 3
        })

        activeConn = conn
        global.conn = conn

        console.log(
            chalk.gray(
                `🔌 Socket created [generation ${generation}]`
            )
        )

        // ====================================================
        // CONNECTION UPDATE
        // ====================================================

        conn.ev.on(
            'connection.update',
            async update => {
                if (!isCurrentSocket(conn, generation)) {
                    return
                }

                const {
                    connection,
                    lastDisconnect
                } = update

                // --------------------------------------------
                // CONNECTING
                // --------------------------------------------

                if (connection === 'connecting') {
                    if (
                        !state.creds.registered &&
                        phoneNumber &&
                        !pairingRequested
                    ) {
                        /*
                         * Do NOT request pairing immediately.
                         *
                         * The other bot effectively gives the
                         * WhatsApp socket time to establish its
                         * transport first.
                         */

                        clearPairingTimer()

                        pairingTimer = setTimeout(
                            async () => {
                                pairingTimer = null

                                if (
                                    !isCurrentSocket(
                                        conn,
                                        generation
                                    )
                                ) {
                                    return
                                }

                                if (
                                    state.creds.registered
                                ) {
                                    return
                                }

                                await requestPairingCode(
                                    conn,
                                    generation,
                                    state,
                                    phoneNumber
                                )
                            },
                            3000
                        )
                    }
                }

                // --------------------------------------------
                // OPEN
                // --------------------------------------------

                if (connection === 'open') {
                    clearPairingTimer()

                    pairingRequested = false

                    reconnectAttempts = 0

                    botReadyAt =
                        botReadyAt ||
                        Math.floor(Date.now() / 1000)

                    global.botReadyAt =
                        botReadyAt

                    global.conn = conn
                    global._conn = conn

                    const botJid =
                        jidNormalizedUser(
                            conn.user?.id || ''
                        )

                    console.log('')
                    console.log(
                        chalk.greenBright(
                            '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
                        )
                    )

                    console.log(
                        chalk.greenBright(
                            `✅ WHATSAPP CONNECTED`
                        )
                    )

                    console.log(
                        chalk.green(
                            `👤 ${conn.user?.name || 'Cloud AI'}`
                        )
                    )

                    console.log(
                        chalk.green(
                            `📱 ${botJid}`
                        )
                    )

                    console.log(
                        chalk.greenBright(
                            '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
                        )
                    )

                    /*
                     * Save credentials immediately after
                     * successful connection.
                     */
                    try {
                        await saveCreds()
                    } catch (err) {
                        console.log(
                            chalk.yellow(
                                `⚠️ Could not save credentials: ${err.message}`
                            )
                        )
                    }

                    // Start your existing loops/hooks here.
                    startReminderLoop(conn)
                    startBioLoop(conn)

                    /*
                     * Optional bot profile picture.
                     */
                    applyBotImage(
                        conn,
                        botJid
                    ).catch(() => {})

                    /*
                     * Owner online notification.
                     */
                    try {
                        const owner =
                            normalizePhoneNumber(
                                process.env.OWNER_NUMBER ||
                                process.env.PAIRING_NUMBER ||
                                ''
                            )

                        if (owner) {
                            await conn.sendMessage(
                                `${owner}@s.whatsapp.net`,
                                {
                                    text:
                                        '━━━━━━━━━━━━━━━━━━━━━\n' +
                                        '🤖 *CLOUD AI — ONLINE*\n' +
                                        '━━━━━━━━━━━━━━━━━━━━━\n\n' +
                                        '✅ Successfully connected to WhatsApp.\n\n' +
                                        '⚡ Bot is ready and running.\n\n' +
                                        '━━━━━━━━━━━━━━━━━━━━━'
                                }
                            )
                        }
                    } catch (err) {
                        console.log(
                            chalk.yellow(
                                `⚠️ Online notification failed: ${err.message}`
                            )
                        )
                    }
                }

                // --------------------------------------------
                // CLOSE
                // --------------------------------------------

                if (connection === 'close') {
                    clearPairingTimer()

                    pairingRequested = false

                    if (
                        !isCurrentSocket(
                            conn,
                            generation
                        )
                    ) {
                        return
                    }

                    /*
                     * Detach this socket immediately.
                     * This prevents another connection from
                     * being considered active at the same time.
                     */
                    activeConn = null

                    global.conn = null
                    global._conn = null

                    const statusCode =
                        getDisconnectStatus(
                            lastDisconnect?.error
                        )

                    console.log(
                        chalk.yellow(
                            `🔌 Connection closed. Code: ${statusCode ?? 'unknown'}`
                        )
                    )

                    // ----------------------------------------
                    // 440 = CONNECTION REPLACED
                    // ----------------------------------------

                    if (
                        statusCode ===
                        DisconnectReason.connectionReplaced
                    ) {
                        console.log(
                            chalk.red(
                                '🛑 Connection replaced by another WhatsApp session.'
                            )
                        )

                        console.log(
                            chalk.red(
                                '🛑 Automatic reconnect stopped to prevent dual sockets.'
                            )
                        )

                        return
                    }

                    // ----------------------------------------
                    // 401 = LOGGED OUT
                    // ----------------------------------------

                    if (
                        statusCode ===
                        DisconnectReason.loggedOut
                    ) {
                        /*
                         * CRITICAL:
                         *
                         * If this socket started while the account
                         * was NOT registered, then a 401 can occur
                         * simply because the pairing attempt failed.
                         *
                         * DO NOT DELETE MongoDB auth in that case.
                         */

                        if (
                            !wasRegisteredAtSocketStart &&
                            !state.creds.registered
                        ) {
                            console.log(
                                chalk.yellow(
                                    '⚠️ 401 occurred during initial pairing.'
                                )
                            )

                            console.log(
                                chalk.yellow(
                                    '🔐 MongoDB authentication will NOT be deleted.'
                                )
                            )

                            scheduleReconnect(
                                'initial pairing connection closed',
                                5000
                            )

                            return
                        }

                        /*
                         * This was an already authenticated
                         * WhatsApp session.
                         *
                         * Now a 401 genuinely means logout.
                         */
                        console.log(
                            chalk.red(
                                '🚪 Existing WhatsApp session was genuinely logged out.'
                            )
                        )

                        try {
                            await clearMongoSession()
                        } catch (err) {
                            console.log(
                                chalk.red(
                                    `❌ Failed clearing MongoDB auth: ${err.message}`
                                )
                            )
                        }

                        reconnectAttempts = 0

                        scheduleReconnect(
                            'session logged out — fresh pairing required',
                            3000
                        )

                        return
                    }

                    // ----------------------------------------
                    // 408 = TIMEOUT
                    // ----------------------------------------

                    if (
                        statusCode ===
                        DisconnectReason.timedOut
                    ) {
                        console.log(
                            chalk.yellow(
                                state.creds.registered
                                    ? '⏱️ Connection timed out — reconnecting without clearing auth.'
                                    : '⏱️ Pairing connection timed out — keeping MongoDB auth.'
                            )
                        )

                        /*
                         * NEVER clear MongoDB auth for 408.
                         */
                        scheduleReconnect(
                            '408 timeout',
                            6000
                        )

                        return
                    }

                    // ----------------------------------------
                    // 515 = RESTART REQUIRED
                    // ----------------------------------------

                    if (
                        statusCode ===
                        DisconnectReason.restartRequired
                    ) {
                        console.log(
                            chalk.yellow(
                                '🔄 WhatsApp requested a socket restart.'
                            )
                        )

                        scheduleReconnect(
                            'WhatsApp restart required',
                            3000
                        )

                        return
                    }

                    // ----------------------------------------
                    // 503 / 500 / 502 / NETWORK
                    // ----------------------------------------

                    console.log(
                        chalk.yellow(
                            `⚠️ Disconnected (code ${statusCode ?? 'unknown'}) — reconnecting without clearing auth.`
                        )
                    )

                    scheduleReconnect(
                        `disconnect ${statusCode ?? 'unknown'}`,
                        5000
                    )
                }
            }
        )

        // ====================================================
        // CREDENTIAL PERSISTENCE
        // ====================================================

        conn.ev.on(
            'creds.update',
            async () => {
                try {
                    await saveCreds()
                } catch (err) {
                    console.log(
                        chalk.red(
                            `❌ MongoDB creds save failed: ${err.message}`
                        )
                    )
                }
            }
        )

        // ====================================================
        // OUTGOING MESSAGE LOGGER
        // ====================================================

        const originalSendMessage =
            conn.sendMessage.bind(conn)

        conn.sendMessage = async (
            jid,
            content,
            options
        ) => {
            try {
                if (
                    !content?.react &&
                    !content?.delete
                ) {
                    const preview =
                        content?.text
                            ? content.text
                                .slice(0, 90)
                                .replace(/\n/g, ' ')
                            : content?.image
                                ? '📷 [image]'
                                : content?.audio
                                    ? '🎵 [audio]'
                                    : content?.video
                                        ? '🎬 [video]'
                                        : content?.sticker
                                            ? '🎴 [sticker]'
                                            : content?.document
                                                ? '📄 [document]'
                                                : '[media]'

                    console.log(
                        chalk.cyan(
                            `📤 SENT → ${jid}: ${preview}`
                        )
                    )
                }
            } catch {}

            return originalSendMessage(
                jid,
                content,
                options
            )
        }

        // ====================================================
        // INCOMING MESSAGES
        // ====================================================

        conn.ev.on(
            'messages.upsert',
            async ({ messages, type }) => {
                if (type !== 'notify') {
                    return
                }

                if (
                    !isCurrentSocket(
                        conn,
                        generation
                    )
                ) {
                    return
                }

                for (const msg of messages) {
                    try {
                        if (
                            msg.key?.remoteJid ===
                            'status@broadcast'
                        ) {
                            if (
                                global.db?.data
                                    ?.settings
                                    ?.autoStatusView
                            ) {
                                await conn.readMessages([
                                    msg.key
                                ])
                            }

                            continue
                        }

                        if (!msg.key?.fromMe) {
                            const rawJid =
                                msg.key?.participant ||
                                msg.key?.remoteJid ||
                                ''

                            if (
                                rawJid.endsWith(
                                    '@s.whatsapp.net'
                                )
                            ) {
                                global.jidPhoneMap[
                                    rawJid
                                ] =
                                    rawJid.split('@')[0]
                            }

                            const M =
                                msg.message || {}

                            const mtype =
                                Object.keys(M)
                                    .find(
                                        key =>
                                            key !==
                                            'messageContextInfo'
                                    )

                            const messageObject =
                                mtype
                                    ? M[mtype]
                                    : null

                            const text =
                                messageObject?.text ||
                                messageObject?.caption ||
                                (
                                    mtype ===
                                    'conversation'
                                        ? M.conversation
                                        : ''
                                ) ||
                                '[message]'

                            console.log(
                                chalk.green(
                                    `📥 RECV ← ${rawJid}: ${String(text)
                                        .slice(0, 90)
                                        .replace(/\n/g, ' ')}`
                                )
                            )
                        }

                        await handleMessage(
                            conn,
                            msg
                        )
                    } catch (err) {
                        console.error(
                            chalk.red(
                                `[MESSAGE ERROR] ${err.message}`
                            )
                        )
                    }
                }
            }
        )

        // ====================================================
        // GROUP EVENTS
        // ====================================================

        conn.ev.on(
            'group-participants.update',
            async event => {
                try {
                    await handleGroupEvents(
                        conn,
                        {
                            'group-participants.update': [
                                event
                            ]
                        }
                    )
                } catch (err) {
                    console.error(
                        chalk.red(
                            `[GROUP ERROR] ${err.message}`
                        )
                    )
                }
            }
        )

        // ====================================================
        // ANTI DELETE
        // ====================================================

        conn.ev.on(
            'messages.delete',
            async deleteEvent => {
                try {
                    await handleAntiDelete(
                        conn,
                        deleteEvent
                    )
                } catch {}
            }
        )

        // ====================================================
        // ANTI EDIT
        // ====================================================

        conn.ev.on(
            'messages.update',
            async updates => {
                try {
                    await handleAntiEdit(
                        conn,
                        { updates }
                    )
                } catch {}
            }
        )

        // ====================================================
        // ANTI CALL
        // ====================================================

        conn.ev.on(
            'call',
            async callEvents => {
                try {
                    const anticall =
                        global.db?.data
                            ?.settings
                            ?.anticall

                    if (!anticall) {
                        return
                    }

                    for (const callEvent of callEvents) {
                        if (
                            callEvent.status !==
                            'offer'
                        ) {
                            continue
                        }

                        try {
                            await conn.rejectCall(
                                callEvent.id,
                                callEvent.from
                            )

                            await conn.sendMessage(
                                callEvent.from,
                                {
                                    text:
                                        '📵 *Anti-Call is enabled.*\n' +
                                        'Voice and video calls are automatically rejected.'
                                }
                            )
                        } catch {}
                    }
                } catch {}
            }
        )

        return conn

    } catch (err) {
        /*
         * Socket creation itself failed.
         *
         * Do NOT delete MongoDB auth.
         */
        activeConn = null
        global.conn = null
        global._conn = null

        console.error(
            chalk.red(
                `[SOCKET ERROR] ${err.message}`
            )
        )

        scheduleReconnect(
            'socket creation failed',
            5000
        )

        throw err

    } finally {
        isConnecting = false
    }
}

// ============================================================
// AUTO BIO
// ============================================================

let bioLoopStarted = false

function startBioLoop(conn) {
    if (bioLoopStarted) {
        return
    }

    bioLoopStarted = true

    const applyBio = async () => {
        try {
            const settings =
                global.db?.data?.settings

            if (!settings?.autobio) {
                return
            }

            const bios =
                settings.bios || []

            if (!bios.length) {
                return
            }

            const index =
                (settings.currentBioIndex || 0) %
                bios.length

            const now = new Date()

            const pad =
                value =>
                    String(value)
                        .padStart(2, '0')

            const time =
                `${pad(now.getHours())}:${pad(now.getMinutes())}`

            const days = [
                'Sunday',
                'Monday',
                'Tuesday',
                'Wednesday',
                'Thursday',
                'Friday',
                'Saturday'
            ]

            const months = [
                'Jan',
                'Feb',
                'Mar',
                'Apr',
                'May',
                'Jun',
                'Jul',
                'Aug',
                'Sep',
                'Oct',
                'Nov',
                'Dec'
            ]

            const date =
                `${days[now.getDay()]}, ${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`

            let bio = bios[index]

            bio = bio
                .replace(
                    /\{time\}/gi,
                    time
                )
                .replace(
                    /\{date\}/gi,
                    date
                )
                .replace(
                    /\{botname\}/gi,
                    'CLOUD AI'
                )

            await conn.updateProfileStatus(
                bio
            )

            settings.currentBioIndex =
                (index + 1) %
                bios.length

            await global.db.write()

        } catch {}
    }

    applyBio()

    setInterval(
        applyBio,
        60 * 60 * 1000
    )
}

// ============================================================
// REMINDERS
// ============================================================

let reminderLoopStarted = false

function startReminderLoop(conn) {
    if (reminderLoopStarted) {
        return
    }

    reminderLoopStarted = true

    setInterval(
        async () => {
            try {
                const reminders =
                    global.db?.data?.reminders

                if (!reminders?.length) {
                    return
                }

                const now =
                    Date.now()

                const due =
                    reminders.filter(
                        reminder =>
                            reminder.fireAt <= now
                    )

                if (!due.length) {
                    return
                }

                global.db.data.reminders =
                    reminders.filter(
                        reminder =>
                            reminder.fireAt > now
                    )

                await global.db.write()

                for (const reminder of due) {
                    try {
                        await conn.sendMessage(
                            reminder.chat,
                            {
                                text:
                                    `⏰ *Reminder!*\n\n${reminder.msg}`
                            }
                        )
                    } catch {}
                }
            } catch {}
        },
        30000
    )
}

// ============================================================
// BOT IMAGE
// ============================================================

async function applyBotImage(
    conn,
    botJid
) {
    const src =
        process.env.BOT_IMAGE?.trim()

    if (!src) {
        return
    }

    try {
        let buffer

        if (
            src.startsWith('http://') ||
            src.startsWith('https://')
        ) {
            const response =
                await axios.get(
                    src,
                    {
                        responseType:
                            'arraybuffer',
                        timeout: 15000
                    }
                )

            buffer =
                Buffer.from(
                    response.data
                )
        } else if (
            fs.existsSync(src)
        ) {
            buffer =
                fs.readFileSync(src)
        } else {
            return
        }

        if (
            typeof conn.updateProfilePicture ===
            'function'
        ) {
            await conn.updateProfilePicture(
                botJid,
                buffer
            )
        }
    } catch {}
}

// ============================================================
// GLOBAL ERROR HANDLERS
// ============================================================

process.on(
    'uncaughtException',
    error => {
        const message =
            error?.message || ''

        console.error(
            chalk.red(
                `[UNCAUGHT] ${message}`
            )
        )

        if (
            message.includes('aesDecryptGCM') ||
            message.includes('Unsupported state') ||
            message.includes('authenticate data')
        ) {
            console.log(
                chalk.yellow(
                    '⚠️ Crypto error detected — performing controlled reconnect.'
                )
            )

            scheduleReconnect(
                'crypto error',
                6000
            )

            return
        }

        /*
         * Do not immediately spawn another socket.
         * scheduleReconnect() guarantees only one timer.
         */
        scheduleReconnect(
            'uncaught exception',
            8000
        )
    }
)

process.on(
    'unhandledRejection',
    reason => {
        const message =
            reason?.message ||
            String(reason)

        console.error(
            chalk.yellow(
                `[UNHANDLED] ${message.slice(0, 300)}`
            )
        )

        if (
            message.includes('aesDecryptGCM') ||
            message.includes('Unsupported state') ||
            message.includes('authenticate data')
        ) {
            scheduleReconnect(
                'crypto rejection',
                6000
            )
        }
    }
)

// ============================================================
// GRACEFUL SHUTDOWN
// ============================================================

async function shutdown(signal) {
    if (shuttingDown) {
        return
    }

    shuttingDown = true

    console.log(
        chalk.yellow(
            `🛑 ${signal} received. Shutting down...`
        )
    )

    clearReconnectTimer()
    clearPairingTimer()

    await closeActiveConnection()

    try {
        if (mongoClient) {
            await mongoClient.close()
        }
    } catch {}

    process.exit(0)
}

process.on(
    'SIGTERM',
    () => shutdown('SIGTERM')
)

process.on(
    'SIGINT',
    () => shutdown('SIGINT')
)

// ============================================================
// HEALTH SERVER
// ============================================================

http.createServer(
    (req, res) => {
        res.writeHead(
            200,
            {
                'Content-Type':
                    'text/plain'
            }
        )

        res.end(
            activeConn
                ? 'CLOUD AI Bot is running 🤖\nWhatsApp: connected'
                : 'CLOUD AI Bot is running 🤖\nWhatsApp: reconnecting'
        )
    }
).listen(
    PORT,
    '0.0.0.0',
    () => {
        console.log(
            chalk.gray(
                `🌐 Keep-alive server: port ${PORT}`
            )
        )
    }
)

// ============================================================
// START
// ============================================================

async function start() {
    try {
        await connectMongo()

        await connectToWhatsApp()

    } catch (error) {
        console.error(
            chalk.red(
                `[START ERROR] ${error.message}`
            )
        )

        scheduleReconnect(
            'startup failed',
            10000
        )
    }
}

start()

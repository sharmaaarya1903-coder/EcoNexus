const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';

const DATA_FILE = path.join(__dirname, 'data.json');
const PUBLIC_DIR = path.join(__dirname, 'public');
const ADMIN_FILE = path.join(
    __dirname,
    'EcoNexus_Main_Data_Center_Users_Updated.html'
);
const ADMIN_FILENAME =
    'EcoNexus_Main_Data_Center_Users_Updated.html';

function loadData() {
    if (!fs.existsSync(DATA_FILE)) {
        const initial = {
            users: {},
            sessions: {},
            events: [],
            gallery: [],
            updates: [],
            settings: {
                appName: 'EcoNexus',
                latestVersion: '1.0.0',
                announcement: 'Welcome to EcoNexus',
                maintenance: false
            }
        };

        fs.writeFileSync(
            DATA_FILE,
            JSON.stringify(initial, null, 2)
        );

        return initial;
    }

    try {
        const data = JSON.parse(
            fs.readFileSync(DATA_FILE, 'utf8')
        );

        data.users ||= {};
        data.sessions ||= {};
        data.events ||= [];
        data.gallery ||= [];
        data.updates ||= [];
        data.settings ||= {};

        data.settings = {
            appName: 'EcoNexus',
            latestVersion: '1.0.0',
            announcement: 'Welcome to EcoNexus',
            maintenance: false,
            ...data.settings
        };

        return data;
    } catch (e) {
        console.error('Failed to load data.json:', e);

        return {
            users: {},
            sessions: {},
            events: [],
            gallery: [],
            updates: [],
            settings: {
                appName: 'EcoNexus',
                latestVersion: '1.0.0',
                announcement: '',
                maintenance: false
            }
        };
    }
}

let db = loadData();

function save() {
    fs.writeFileSync(
        DATA_FILE,
        JSON.stringify(db, null, 2)
    );
}

function id() {
    return crypto.randomUUID();
}

function token() {
    return crypto.randomBytes(32).toString('hex');
}

function now() {
    return new Date().toISOString();
}

function send(res, status, payload, headers = {}) {
    const body =
        typeof payload === 'string'
            ? payload
            : JSON.stringify(payload);

    res.writeHead(
        status,
        Object.assign(
            {
                'Content-Type':
                    'application/json; charset=utf-8',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers':
                    'Content-Type, Authorization',
                'Access-Control-Allow-Methods':
                    'GET,POST,PUT,DELETE,OPTIONS'
            },
            headers
        )
    );

    res.end(body);
}

function notFound(res) {
    send(res, 404, {
        error: 'Not found'
    });
}

function parseBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        let rejected = false;

        req.on('data', chunk => {
            if (rejected) {
                return;
            }

            body += chunk;

            if (body.length > 10 * 1024 * 1024) {
                rejected = true;
                req.destroy();
                reject(
                    new Error('Request body too large.')
                );
            }
        });

        req.on('end', () => {
            if (rejected) {
                return;
            }

            try {
                resolve(
                    body
                        ? JSON.parse(body)
                        : {}
                );
            } catch (e) {
                reject(e);
            }
        });

        req.on('error', err => {
            if (!rejected) {
                reject(err);
            }
        });
    });
}

function auth(req) {
    const header =
        req.headers.authorization || '';

    const accessToken =
        header.startsWith('Bearer ')
            ? header.slice(7)
            : '';

    return accessToken &&
        db.sessions[accessToken]
        ? db.sessions[accessToken]
        : null;
}

function safeUser(u) {
    return {
        id: u.id,
        email: u.email,
        name: u.name || '',
        createdAt: u.createdAt,
        lastLogin: u.lastLogin || null,
        lastSeen: u.lastSeen || null,
        active:
            !!u.lastSeen &&
            Date.now() -
                new Date(u.lastSeen).getTime() <
                90000
    };
}

function contentType(file) {
    const ext =
        path.extname(file).toLowerCase();

    const types = {
        '.html':
            'text/html; charset=utf-8',
        '.js':
            'application/javascript; charset=utf-8',
        '.css':
            'text/css; charset=utf-8',
        '.json':
            'application/json; charset=utf-8',
        '.png':
            'image/png',
        '.jpg':
            'image/jpeg',
        '.jpeg':
            'image/jpeg',
        '.webp':
            'image/webp',
        '.svg':
            'image/svg+xml',
        '.gif':
            'image/gif',
        '.ico':
            'image/x-icon',
        '.webmanifest':
            'application/manifest+json',
        '.txt':
            'text/plain; charset=utf-8'
    };

    return (
        types[ext] ||
        'application/octet-stream'
    );
}

function serveFile(res, file) {
    if (!fs.existsSync(file)) {
        return notFound(res);
    }

    let stats;

    try {
        stats = fs.statSync(file);
    } catch (e) {
        return notFound(res);
    }

    if (!stats.isFile()) {
        return notFound(res);
    }

    res.writeHead(
        200,
        {
            'Content-Type':
                contentType(file),
            'Access-Control-Allow-Origin': '*'
        }
    );

    const stream =
        fs.createReadStream(file);

    stream.on('error', () => {
        if (!res.headersSent) {
            send(res, 500, {
                error: 'Failed to read file.'
            });
        } else {
            res.destroy();
        }
    });

    stream.pipe(res);
}

function serveStatic(res, pathname) {
    if (
        pathname === '/admin' ||
        pathname === '/admin/'
    ) {
        return serveFile(
            res,
            ADMIN_FILE
        );
    }

    if (
        pathname ===
        `/${ADMIN_FILENAME}`
    ) {
        return serveFile(
            res,
            ADMIN_FILE
        );
    }

    const cleanPath =
        pathname.replace(
            /^[/\\]+/,
            ''
        );

    const publicRoot =
        path.resolve(PUBLIC_DIR);

    const resolvedFile =
        path.resolve(
            PUBLIC_DIR,
            cleanPath
        );

    if (
        resolvedFile !== publicRoot &&
        !resolvedFile.startsWith(
            publicRoot + path.sep
        )
    ) {
        return notFound(res);
    }

    return serveFile(
        res,
        resolvedFile
    );
}

const server = http.createServer(
    async (req, res) => {
        if (
            req.method === 'OPTIONS'
        ) {
            res.writeHead(
                204,
                {
                    'Access-Control-Allow-Origin':
                        '*',
                    'Access-Control-Allow-Headers':
                        'Content-Type, Authorization',
                    'Access-Control-Allow-Methods':
                        'GET,POST,PUT,DELETE,OPTIONS'
                }
            );

            return res.end();
        }

        const url = new URL(
            req.url,
            `http://${req.headers.host || 'localhost'}`
        );

        const p = url.pathname;

        try {
            if (!p.startsWith('/api/')) {
                return serveStatic(
                    res,
                    p
                );
            }

            if (
                p === '/api/health' &&
                req.method === 'GET'
            ) {
                return send(
                    res,
                    200,
                    {
                        ok: true,
                        app: 'EcoNexus',
                        time: now()
                    }
                );
            }

            if (
                p === '/api/auth/register' &&
                req.method === 'POST'
            ) {
                const b =
                    await parseBody(req);

                const email =
                    String(
                        b.email || ''
                    )
                        .trim()
                        .toLowerCase();

                const password =
                    String(
                        b.password || ''
                    );

                if (
                    !email ||
                    password.length < 6
                ) {
                    return send(
                        res,
                        400,
                        {
                            error:
                                'Email and password are required.'
                        }
                    );
                }

                if (
                    db.users[email]
                ) {
                    return send(
                        res,
                        409,
                        {
                            error:
                                'Account already exists.'
                        }
                    );
                }

                const u = {
                    id: id(),
                    email,
                    passwordHash:
                        crypto
                            .createHash(
                                'sha256'
                            )
                            .update(
                                password
                            )
                            .digest(
                                'hex'
                            ),
                    createdAt: now(),
                    lastLogin: now(),
                    lastSeen: now()
                };

                db.users[email] = u;

                const accessToken =
                    token();

                db.sessions[
                    accessToken
                ] = {
                    userId: u.id,
                    email: u.email,
                    createdAt: now(),
                    lastSeen: now()
                };

                save();

                return send(
                    res,
                    200,
                    {
                        token:
                            accessToken
                    }
                );
            }

            if (
                p === '/api/auth/login' &&
                req.method === 'POST'
            ) {
                const b =
                    await parseBody(req);

                const email =
                    String(
                        b.email || ''
                    )
                        .trim()
                        .toLowerCase();

                const password =
                    String(
                        b.password || ''
                    );

                const u =
                    db.users[email];

                const passwordHash =
                    crypto
                        .createHash(
                            'sha256'
                        )
                        .update(
                            password
                        )
                        .digest(
                            'hex'
                        );

                if (
                    !u ||
                    u.passwordHash !==
                        passwordHash
                ) {
                    return send(
                        res,
                        401,
                        {
                            error:
                                'Invalid credentials.'
                        }
                    );
                }

                u.lastLogin = now();
                u.lastSeen = now();

                const accessToken =
                    token();

                db.sessions[
                    accessToken
                ] = {
                    userId: u.id,
                    email: u.email,
                    createdAt: now(),
                    lastSeen: now()
                };

                save();

                return send(
                    res,
                    200,
                    {
                        token:
                            accessToken
                    }
                );
            }

            if (
                p ===
                    '/api/auth/heartbeat' &&
                req.method === 'POST'
            ) {
                const session =
                    auth(req);

                if (!session) {
                    return send(
                        res,
                        401,
                        {
                            error:
                                'Not authenticated.'
                        }
                    );
                }

                session.lastSeen =
                    now();

                const u =
                    Object.values(
                        db.users
                    ).find(
                        user =>
                            user.id ===
                            session.userId
                    );

                if (u) {
                    u.lastSeen =
                        now();
                }

                save();

                return send(
                    res,
                    200,
                    {
                        ok: true
                    }
                );
            }

            if (
                p === '/api/admin/users' &&
                req.method === 'GET'
            ) {
                const users =
                    Object.values(
                        db.users
                    )
                        .map(
                            safeUser
                        )
                        .sort(
                            (a, b) =>
                                new Date(
                                    b.lastLogin ||
                                        0
                                ) -
                                new Date(
                                    a.lastLogin ||
                                        0
                                )
                        );

                const today =
                    new Date()
                        .toISOString()
                        .slice(
                            0,
                            10
                        );

                const active =
                    users.filter(
                        user =>
                            user.active
                    ).length;

                const loggedInToday =
                    users.filter(
                        user =>
                            user.lastLogin &&
                            user.lastLogin.slice(
                                0,
                                10
                            ) === today
                    ).length;

                const newAccounts =
                    users.filter(
                        user =>
                            user.createdAt &&
                            user.createdAt.slice(
                                0,
                                10
                            ) === today
                    ).length;

                return send(
                    res,
                    200,
                    {
                        users,
                        stats: {
                            total:
                                users.length,
                            active,
                            loggedInToday,
                            newAccounts
                        }
                    }
                );
            }

            if (
                p ===
                    '/api/admin/users/logout' &&
                req.method === 'POST'
            ) {
                const b =
                    await parseBody(req);

                const userId =
                    String(
                        b.userId || ''
                    );

                for (
                    const [
                        sessionToken,
                        session
                    ] of Object.entries(
                        db.sessions
                    )
                ) {
                    if (
                        session.userId ===
                        userId
                    ) {
                        delete db.sessions[
                            sessionToken
                        ];
                    }
                }

                const user =
                    Object.values(
                        db.users
                    ).find(
                        item =>
                            item.id ===
                            userId
                    );

                if (user) {
                    user.lastSeen =
                        null;
                }

                save();

                return send(
                    res,
                    200,
                    {
                        ok: true
                    }
                );
            }

            if (
                p ===
                    '/api/admin/events' &&
                req.method === 'GET'
            ) {
                return send(
                    res,
                    200,
                    {
                        events:
                            db.events
                    }
                );
            }

            if (
                p ===
                    '/api/admin/events' &&
                req.method === 'POST'
            ) {
                const b =
                    await parseBody(req);

                const event = {
                    ...b,
                    id: id(),
                    createdAt: now()
                };

                db.events.push(event);

                save();

                return send(
                    res,
                    200,
                    event
                );
            }

            if (
                p ===
                    '/api/admin/events' &&
                req.method === 'DELETE'
            ) {
                const b =
                    await parseBody(req);

                db.events =
                    db.events.filter(
                        event =>
                            event.id !==
                            b.id
                    );

                save();

                return send(
                    res,
                    200,
                    {
                        ok: true
                    }
                );
            }

            if (
                p === '/api/events' &&
                req.method === 'GET'
            ) {
                return send(
                    res,
                    200,
                    {
                        events:
                            db.events
                    }
                );
            }

            if (
                p ===
                    '/api/admin/updates' &&
                req.method === 'GET'
            ) {
                return send(
                    res,
                    200,
                    {
                        updates:
                            db.updates
                    }
                );
            }

            if (
                p ===
                    '/api/admin/updates' &&
                req.method === 'POST'
            ) {
                const b =
                    await parseBody(req);

                const update = {
                    ...b,
                    id: id(),
                    date:
                        new Date()
                            .toISOString()
                            .slice(
                                0,
                                10
                            ),
                    createdAt: now()
                };

                db.updates.unshift(
                    update
                );

                save();

                return send(
                    res,
                    200,
                    update
                );
            }

            if (
                p ===
                    '/api/admin/updates' &&
                req.method === 'DELETE'
            ) {
                const b =
                    await parseBody(req);

                db.updates =
                    db.updates.filter(
                        update =>
                            update.id !==
                            b.id
                    );

                save();

                return send(
                    res,
                    200,
                    {
                        ok: true
                    }
                );
            }

            if (
                p === '/api/updates' &&
                req.method === 'GET'
            ) {
                return send(
                    res,
                    200,
                    {
                        updates:
                            db.updates
                    }
                );
            }

            if (
                p === '/api/settings' &&
                req.method === 'GET'
            ) {
                return send(
                    res,
                    200,
                    db.settings
                );
            }

            if (
                p ===
                    '/api/admin/settings' &&
                req.method === 'PUT'
            ) {
                const b =
                    await parseBody(req);

                db.settings = {
                    ...db.settings,
                    ...b
                };

                save();

                return send(
                    res,
                    200,
                    db.settings
                );
            }

            if (
                p === '/api/gallery' &&
                req.method === 'GET'
            ) {
                return send(
                    res,
                    200,
                    {
                        gallery:
                            db.gallery
                    }
                );
            }

            if (
                p ===
                    '/api/admin/gallery' &&
                req.method === 'POST'
            ) {
                const b =
                    await parseBody(req);

                if (!b.data) {
                    return send(
                        res,
                        400,
                        {
                            error:
                                'Image data is required.'
                        }
                    );
                }

                const galleryItem = {
                    id: id(),
                    title:
                        b.title ||
                        'EcoNexus Photo',
                    url: b.data,
                    createdAt: now()
                };

                db.gallery.unshift(
                    galleryItem
                );

                save();

                return send(
                    res,
                    200,
                    galleryItem
                );
            }

            if (
                p ===
                    '/api/admin/gallery' &&
                req.method === 'DELETE'
            ) {
                const b =
                    await parseBody(req);

                db.gallery =
                    db.gallery.filter(
                        item =>
                            item.id !==
                            b.id
                    );

                save();

                return send(
                    res,
                    200,
                    {
                        ok: true
                    }
                );
            }

            return notFound(res);
        } catch (e) {
            console.error(
                'Server error:',
                e
            );

            if (
                e.message ===
                'Request body too large.'
            ) {
                return send(
                    res,
                    413,
                    {
                        error:
                            'Request body too large.'
                    }
                );
            }

            if (
                e instanceof
                SyntaxError
            ) {
                return send(
                    res,
                    400,
                    {
                        error:
                            'Invalid JSON request body.'
                    }
                );
            }

            return send(
                res,
                500,
                {
                    error:
                        'Server error'
                }
            );
        }
    }
);

console.log(
    'RUNNING SERVER FILE:',
    __filename
);

console.log(
    'ADMIN FILE:',
    ADMIN_FILE
);

console.log(
    'ADMIN EXISTS:',
    fs.existsSync(
        ADMIN_FILE
    )
);

console.log(
    'PUBLIC DIRECTORY:',
    PUBLIC_DIR
);

server.listen(
    PORT,
    HOST,
    () => {
        console.log(
            `EcoNexus server running at http://${HOST}:${PORT}`
        );

        console.log(
            `LAN address: http://YOUR-PC-IP:${PORT}`
        );

        console.log(
            'Admin authentication: DISABLED'
        );
    }
);
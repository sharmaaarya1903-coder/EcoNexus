const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';

const DATA_FILE = path.join(__dirname, 'data.json');
const PUBLIC_DIR = path.join(__dirname, 'public');
console.log('SERVER DIRECTORY:', __dirname);
console.log(
    'ADMIN FILE:',
    path.join(
        __dirname,
        '..',
        'EcoNexus_Main_Data_Center_Users_Updated.html'
    )
);
console.log(
    'ADMIN EXISTS:',
    fs.existsSync(
        path.join(
            __dirname,
            '..',
            'EcoNexus_Main_Data_Center_Users_Updated.html'
        )
    )
);
const MAX_BODY_SIZE = 25 * 1024 * 1024;

function initialData() {
    return {
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
}

function loadData() {
    if (!fs.existsSync(DATA_FILE)) {
        const data = initialData();
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
        return data;
    }

    try {
        const saved = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        const base = initialData();

        return {
            ...base,
            ...saved,
            users: saved.users || {},
            sessions: saved.sessions || {},
            events: Array.isArray(saved.events) ? saved.events : [],
            gallery: Array.isArray(saved.gallery) ? saved.gallery : [],
            updates: Array.isArray(saved.updates) ? saved.updates : [],
            settings: {
                ...base.settings,
                ...(saved.settings || {})
            }
        };
    } catch (error) {
        console.error('Could not read data.json:', error);
        return initialData();
    }
}

let db = loadData();

function save() {
    fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
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

    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
        'Cache-Control': 'no-store',
        ...headers
    });

    res.end(body);
}

function sendHtml(res, html) {
    res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store'
    });

    res.end(html);
}

function notFound(res) {
    send(res, 404, {
        error: 'Not found'
    });
}

function parseBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        let finished = false;

        req.on('data', chunk => {
            if (finished) return;

            body += chunk.toString();

            if (Buffer.byteLength(body, 'utf8') > MAX_BODY_SIZE) {
                finished = true;

                reject(
                    Object.assign(
                        new Error('Request body too large.'),
                        { statusCode: 413 }
                    )
                );

                req.destroy();
            }
        });

        req.on('end', () => {
            if (finished) return;

            if (!body) {
                return resolve({});
            }

            try {
                resolve(JSON.parse(body));
            } catch {
                reject(
                    Object.assign(
                        new Error('Invalid JSON body.'),
                        { statusCode: 400 }
                    )
                );
            }
        });

        req.on('error', error => {
            if (!finished) {
                reject(error);
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

function safeUser(user) {
    return {
        id: user.id,
        email: user.email,
        name: user.name || '',
        createdAt: user.createdAt,
        lastLogin: user.lastLogin || null,
        lastSeen: user.lastSeen || null,
        active:
            !!user.lastSeen &&
            Date.now() -
            new Date(user.lastSeen).getTime() <
            90000
    };
}

function serveStatic(res, pathname) {
    let resolvedFile;

    if (
        pathname === '/admin' ||
        pathname === '/admin/'
    ) {
        resolvedFile = path.resolve(
            ADMIN_FILE
        );
    } else {
        const file =
            pathname === '/'
                ? path.join(
                    PUBLIC_DIR,
                    'index.html'
                )
                : path.join(
                    PUBLIC_DIR,
                    pathname.replace(
                        /^[/\\]+/,
                        ''
                    )
                );

        const publicRoot =
            path.resolve(PUBLIC_DIR);

        resolvedFile =
            path.resolve(file);

        if (
            !resolvedFile.startsWith(
                publicRoot
            )
        ) {
            return notFound(res);
        }
    }

    if (
        !fs.existsSync(
            resolvedFile
        )
    ) {
        return notFound(res);
    }

    const ext =
        path.extname(
            resolvedFile
        ).toLowerCase();

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

        '.webmanifest':
            'application/manifest+json'
    };

    res.writeHead(
        200,
        {
            'Content-Type':
                types[ext] ||
                'application/octet-stream',

            'Access-Control-Allow-Origin':
                '*'
        }
    );

    fs.createReadStream(
        resolvedFile
    ).pipe(res);
}
function serveAdmin(res) {
    if (!fs.existsSync(ADMIN_FILE)) {
        return send(res, 404, {
            error:
                'Admin dashboard file was not found.'
        });
    }

    try {
        const html =
            fs.readFileSync(
                ADMIN_FILE,
                'utf8'
            );

        return sendHtml(res, html);
    } catch (error) {
        console.error(
            'Could not load admin dashboard:',
            error
        );

        return send(res, 500, {
            error:
                'Could not load admin dashboard.'
        });
    }
}

const server =
    http.createServer(
        async (req, res) => {
            if (req.method === 'OPTIONS') {
                res.writeHead(204, {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers':
                        'Content-Type, Authorization',
                    'Access-Control-Allow-Methods':
                        'GET,POST,PUT,DELETE,OPTIONS',
                    'Access-Control-Max-Age': '86400'
                });

                return res.end();
            }

            const url =
                new URL(
                    req.url,
                    `http://${req.headers.host || 'localhost'}`
                );

            const p = url.pathname;

            try {
                if (
                    p === '/admin' ||
                    p === '/admin/' ||
                    p === '/admin.html'
                ) {
                    return serveAdmin(res);
                }

                if (!p.startsWith('/api/')) {
                    return serveStatic(res, p);
                }

                if (
                    p === '/api/health' &&
                    req.method === 'GET'
                ) {
                    return send(res, 200, {
                        ok: true,
                        app: 'EcoNexus',
                        time: now()
                    });
                }

                if (
                    p === '/api/admin/health' &&
                    req.method === 'GET'
                ) {
                    return send(res, 200, {
                        ok: true,
                        admin: true,
                        time: now()
                    });
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

                    const name =
                        String(
                            b.name || ''
                        ).trim();

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

                    if (db.users[email]) {
                        return send(
                            res,
                            409,
                            {
                                error:
                                    'Account already exists.'
                            }
                        );
                    }

                    const user = {
                        id: id(),
                        email,
                        name,
                        passwordHash:
                            crypto
                                .createHash('sha256')
                                .update(password)
                                .digest('hex'),
                        createdAt: now(),
                        lastLogin: now(),
                        lastSeen: now()
                    };

                    db.users[email] = user;

                    const accessToken =
                        token();

                    db.sessions[
                        accessToken
                    ] = {
                        userId: user.id,
                        email: user.email,
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

                    const user =
                        db.users[email];

                    const passwordHash =
                        crypto
                            .createHash('sha256')
                            .update(password)
                            .digest('hex');

                    if (
                        !user ||
                        user.passwordHash !==
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

                    user.lastLogin = now();
                    user.lastSeen = now();

                    const accessToken =
                        token();

                    db.sessions[
                        accessToken
                    ] = {
                        userId: user.id,
                        email: user.email,
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
                    p === '/api/auth/heartbeat' &&
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

                    const timestamp =
                        now();

                    session.lastSeen =
                        timestamp;

                    const user =
                        Object
                            .values(
                                db.users
                            )
                            .find(
                                x =>
                                    x.id ===
                                    session.userId
                            );

                    if (user) {
                        user.lastSeen =
                            timestamp;
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
                        Object
                            .values(db.users)
                            .map(safeUser)
                            .sort(
                                (a, b) =>
                                    new Date(
                                        b.lastLogin || 0
                                    ) -
                                    new Date(
                                        a.lastLogin || 0
                                    )
                            );

                    const today =
                        new Date()
                            .toISOString()
                            .slice(0, 10);

                    return send(
                        res,
                        200,
                        {
                            users,
                            stats: {
                                total:
                                    users.length,

                                active:
                                    users.filter(
                                        u =>
                                            u.active
                                    ).length,

                                loggedInToday:
                                    users.filter(
                                        u =>
                                            u.lastLogin &&
                                            u.lastLogin.slice(
                                                0,
                                                10
                                            ) ===
                                            today
                                    ).length,

                                newAccounts:
                                    users.filter(
                                        u =>
                                            u.createdAt &&
                                            u.createdAt.slice(
                                                0,
                                                10
                                            ) ===
                                            today
                                    ).length
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
                        Object
                            .values(
                                db.users
                            )
                            .find(
                                x =>
                                    x.id ===
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
                    p === '/api/admin/events' &&
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
                    p === '/api/admin/events' &&
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
                    p === '/api/admin/events' &&
                    req.method === 'DELETE'
                ) {
                    const b =
                        await parseBody(req);

                    db.events =
                        db.events.filter(
                            x =>
                                x.id !==
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
                    p === '/api/admin/updates' &&
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
                    p === '/api/admin/updates' &&
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
                    p === '/api/admin/updates' &&
                    req.method === 'DELETE'
                ) {
                    const b =
                        await parseBody(req);

                    db.updates =
                        db.updates.filter(
                            x =>
                                x.id !==
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
                    p === '/api/admin/settings' &&
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
                    p === '/api/admin/gallery' &&
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

                    const image = {
                        id: id(),
                        title:
                            String(
                                b.title ||
                                'EcoNexus Photo'
                            ).trim(),
                        url: b.data,
                        createdAt: now()
                    };

                    db.gallery.unshift(
                        image
                    );

                    save();

                    return send(
                        res,
                        200,
                        image
                    );
                }

                if (
                    p === '/api/admin/gallery' &&
                    req.method === 'DELETE'
                ) {
                    const b =
                        await parseBody(req);

                    db.gallery =
                        db.gallery.filter(
                            x =>
                                x.id !==
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
            } catch (error) {
                console.error(
                    'Server error:',
                    error
                );

                return send(
                    res,
                    error.statusCode || 500,
                    {
                        error:
                            error.message ||
                            'Server error'
                    }
                );
            }
        }
    );

server.listen(
    PORT,
    HOST,
    () => {
        console.log(
            '======================================'
        );
        console.log(
            '        EcoNexus Server Started'
        );
        console.log(
            '======================================'
        );
        console.log(
            `Local: http://localhost:${PORT}`
        );
        console.log(
            `Admin: http://localhost:${PORT}/admin`
        );
        console.log(
            `Admin: http://localhost:${PORT}/admin.html`
        );
        console.log(
            `Admin API: http://localhost:${PORT}/api/admin/health`
        );
        console.log(
            `LAN: http://YOUR-PC-IP:${PORT}`
        );
        console.log(
            'Admin authentication: DISABLED'
        );
        console.log(
            '======================================'
        );
    }
);
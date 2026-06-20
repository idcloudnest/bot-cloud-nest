import { config } from '../config.js';

export function basicAuth(req, res, next) {
    const header = req.headers.authorization || '';
    const [type, credentials] = header.split(' ');

    if (type === 'Basic' && credentials) {
        const decoded = Buffer.from(credentials, 'base64').toString('utf8');
        const separatorIndex = decoded.indexOf(':');
        const username = decoded.slice(0, separatorIndex);
        const password = decoded.slice(separatorIndex + 1);

        if (username === config.adminUsername && password === config.adminPassword) {
            next();
            return;
        }
    }

    res.setHeader('WWW-Authenticate', 'Basic realm="WA Bot Console"');
    res.status(401).send('Authentication required');
}

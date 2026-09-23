import { createTransport } from '../api/createTransport.js';

/** Admin endpoints stay out of the generated player client. No automatic command retries. */
export class AdminService {
    constructor(boot) {
        this.transport = createTransport(boot);
        this.base = new URL(boot.apiUrl, boot.baseUrl).pathname.replace(/\/games$/, '');
    }
    read(path, scope) {
        return this.transport({ path: this.base + path, signal: scope?.signal });
    }
    write(path, body) {
        return this.transport({ method: 'POST', path: this.base + path, body });
    }
}

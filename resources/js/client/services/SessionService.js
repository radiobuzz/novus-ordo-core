export class SessionService {
    constructor(boot) {
        this.boot = boot;
    }
    async refresh(signal) {
        Object.assign(this.boot, await this.api.getEntrySession({ signal }));
        return this.boot;
    }
    async login(username, password, signal) {
        // A fresh guest/session token also permits reauthentication after a 419 response.
        await this.refresh(signal);
        const result = await this.api.loginUser({ body: { username, password }, signal });
        Object.assign(this.boot, result);
        return result;
    }
}

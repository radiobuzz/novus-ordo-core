export class ApiError extends Error {
    constructor(category, message, { status = null, fields = {}, uncertain = false, cause } = {}) {
        super(message, { cause });
        this.name = 'ApiError';
        this.category = category;
        this.status = status;
        this.fields = fields;
        this.uncertain = uncertain;
    }
}

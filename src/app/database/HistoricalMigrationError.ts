export class HistoricalMigrationError extends Error {
    constructor(detail: string) {
        super(detail + ' Export a recovery-only archive for review; do not clear storage.');
        this.name = 'HistoricalMigrationError';
    }
}

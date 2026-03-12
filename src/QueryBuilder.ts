export class QueryBuilder {
    /**
     * Builds a tiered list of search queries for a token.
     * Tries strongest signals first, falls back to weaker ones.
     *
     * @param name  - Token name (e.g. "Pepe")
     * @param symbol - Token symbol (e.g. "PEPE")
     * @param mint  - Contract address (optional)
     * @returns Array of query strings, strongest first
     */
    static build(name: string, symbol: string, mint?: string): string[] {
        const cleanName = name.trim();
        const cleanSymbol = symbol.trim().toUpperCase();
        const queries: string[] = [];

        // Tier 1: Cashtag (Strongest Signal)
        if (cleanSymbol.length >= 3) {
            queries.push(`$${cleanSymbol}`);
        }

        // Tier 2: Name + "solana" (Context specific)
        queries.push(`"${cleanName}" solana`);

        // Tier 3: Symbol + "solana" (Backup)
        queries.push(`${cleanSymbol} solana`);

        // Tier 4: Contract Address prefix (Last Resort)
        if (mint) {
            queries.push(mint.slice(0, 8));
        }

        return [...new Set(queries)];
    }

    /**
     * Builds a simple query from free-text keywords.
     */
    static fromKeywords(...keywords: string[]): string[] {
        return keywords.filter(k => k.trim()).map(k => k.trim());
    }
}

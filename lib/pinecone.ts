import { Pinecone } from '@pinecone-database/pinecone';
import { PINECONE_TOP_K } from '@/config';
import { searchResultsToChunks, getSourcesFromChunks, getContextFromSources } from '@/lib/sources';
import { PINECONE_INDEX_NAME } from '@/config';

if (!process.env.PINECONE_API_KEY) {
    throw new Error('PINECONE_API_KEY is not set');
}

export const pinecone = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY,
});

export const pineconeIndex = pinecone.Index(PINECONE_INDEX_NAME);

export type PlacementNamespacesResult = {
    placementsContext: string;
    placementCompanies: string[];
    placementStatsContext: string;
};

async function searchPlacementsNamespace(query: string): Promise<{ context: string; companies: string[] }> {
    console.log('[VERCEL LOG] Searching placements namespace with query:', query);
    const results = await pineconeIndex.namespace('placements').searchRecords({
        query: {
            inputs: {
                text: query,
            },
            topK: PINECONE_TOP_K,
        },
        fields: ['text', 'pre_context', 'post_context', 'source_url', 'source_description', 'source_type', 'order'],
    });

    console.log('[VERCEL LOG] Placements namespace raw results:', {
        hasResults: !!results,
        isArray: Array.isArray(results),
        hasMatches: !!(results && (results as any).matches),
        matchesCount: (results && (results as any).matches) ? (results as any).matches.length : 0,
    });

    const chunks = searchResultsToChunks(results);
    console.log('[VERCEL LOG] Placements namespace chunks:', {
        chunksCount: chunks.length,
        firstChunkText: chunks[0]?.text?.substring(0, 100) || 'none',
    });

    if (chunks.length === 0) {
        console.log('[VERCEL LOG] No chunks found in placements namespace');
        return { context: '', companies: [] };
    }

    const sources = getSourcesFromChunks(chunks);
    const context = getContextFromSources(sources);

    // Extract distinct company names from the chunk text where lines start with "Company: <Name>"
    const companySet = new Set<string>();
    for (const chunk of chunks) {
        const match = chunk.text.match(/Company:\s*(.+)/);
        if (match && match[1]) {
            companySet.add(match[1].trim());
        }
    }

    const companies = Array.from(companySet);
    console.log('[VERCEL LOG] Placements namespace extracted companies:', companies);

    return {
        context: `<placements_results> ${context} </placements_results>`,
        companies,
    };
}

async function searchPlacementStatsNamespace(query: string): Promise<string> {
    console.log('[VERCEL LOG] Searching placement_stats namespace with query:', query);
    const results = await pineconeIndex.namespace('placement_stats').searchRecords({
        query: {
            inputs: {
                text: query,
            },
            topK: PINECONE_TOP_K,
        },
        fields: ['text', 'name', 'company', 'ctc', 'status', 'yoe'],
    });

    console.log('[VERCEL LOG] Placement_stats namespace raw results:', {
        hasResults: !!results,
        isArray: Array.isArray(results),
        hasMatches: !!(results && (results as any).matches),
        matchesCount: (results && (results as any).matches) ? (results as any).matches.length : 0,
    });

    // Pinecone returns { matches: [...] } structure
    // Cast to any to access matches property that exists at runtime but not in types
    const resultsAny = results as any;
    let records: any[] = [];
    if (Array.isArray(results)) {
        records = results;
    } else if (resultsAny?.matches && Array.isArray(resultsAny.matches)) {
        records = resultsAny.matches;
    } else if (resultsAny?.records && Array.isArray(resultsAny.records)) {
        records = resultsAny.records;
    } else if (resultsAny?.result?.hits && Array.isArray(resultsAny.result.hits)) {
        records = resultsAny.result.hits;
    } else if (resultsAny?.data && Array.isArray(resultsAny.data)) {
        records = resultsAny.data;
    }

    console.log('[VERCEL LOG] Placement_stats namespace parsed records:', {
        recordsCount: records.length,
        firstRecordMetadata: records[0]?.metadata || 'none',
    });

    if (!Array.isArray(records) || records.length === 0) {
        console.log('[VERCEL LOG] No records found in placement_stats namespace');
        return '';
    }

    const lines: string[] = [];
    for (const record of records) {
        // Check metadata first (as shown in user's query response), then fields
        const metadata = record.metadata || {};
        const fields = record.fields || record.values || record.data || {};
        const text = metadata.text || fields.text || record.text || '';
        if (text) {
            lines.push(String(text));
        }
    }

    console.log('[VERCEL LOG] Placement_stats namespace extracted lines:', {
        linesCount: lines.length,
        firstLine: lines[0]?.substring(0, 100) || 'none',
    });

    if (lines.length === 0) {
        return '';
    }

    return `<placement_stats_results>
${lines.join('\n')}
</placement_stats_results>`;
}

export async function searchPinecone(
    query: string,
): Promise<PlacementNamespacesResult> {
    console.log('[VERCEL LOG] Starting searchPinecone with query:', query);
    const [placements, placementStats] = await Promise.all([
        searchPlacementsNamespace(query),
        searchPlacementStatsNamespace(query),
    ]);

    console.log('[VERCEL LOG] Initial search results:', {
        placementsCompaniesCount: placements.companies.length,
        placementsContextLength: placements.context.length,
        placementStatsContextLength: placementStats.length,
    });

    // If placements search returned no companies, try a broader search with "BITSoM placement companies"
    if (placements.companies.length === 0 && placements.context === '') {
        console.log('[VERCEL LOG] No placements found, trying broader search...');
        const broaderPlacements = await searchPlacementsNamespace('BITSoM placement companies');
        if (broaderPlacements.companies.length > 0 || broaderPlacements.context) {
            console.log('[VERCEL LOG] Broader search found results:', {
                companiesCount: broaderPlacements.companies.length,
                companies: broaderPlacements.companies,
            });
            return {
                placementsContext: broaderPlacements.context,
                placementCompanies: broaderPlacements.companies,
                placementStatsContext: placementStats,
            };
        }
    }

    const finalResult = {
        placementsContext: placements.context,
        placementCompanies: placements.companies,
        placementStatsContext: placementStats,
    };

    console.log('[VERCEL LOG] Final searchPinecone result:', {
        placementsContextLength: finalResult.placementsContext.length,
        placementCompaniesCount: finalResult.placementCompanies.length,
        placementCompanies: finalResult.placementCompanies,
        placementStatsContextLength: finalResult.placementStatsContext.length,
    });

    return finalResult;
}
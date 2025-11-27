import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';
import { randomUUID } from 'crypto';
import { PINECONE_TOP_K } from '@/config';
import { searchResultsToChunks, getSourcesFromChunks, getContextFromSources } from '@/lib/sources';
import { PINECONE_INDEX_NAME } from '@/config';

if (!process.env.PINECONE_API_KEY) {
    throw new Error('PINECONE_API_KEY is not set');
}

if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not set');
}

export const pinecone = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY,
});

export const pineconeIndex = pinecone.Index(PINECONE_INDEX_NAME);

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// Generate embeddings using OpenAI text-embedding-3-large (3072 dimensions)
async function generateEmbedding(text: string): Promise<number[]> {
    const response = await openai.embeddings.create({
        model: 'text-embedding-3-large',
        input: text,
    });
    return response.data[0].embedding;
}

export type PlacementNamespacesResult = {
    placementsContext: string;
    placementCompanies: string[];
    placementStatsContext: string;
    transcriptsContext: string;
    linkedinProfilesContext: string;
};

export type PlacementListing = {
    id: string;
    company: string;
    role: string;
    location?: string;
    jobPackage?: string;
    publishDate?: string;
    deadline?: string;
    sourceName?: string;
    sourceUrl?: string;
    description?: string;
    isOpen?: boolean;
};

async function searchPlacementsNamespace(query: string): Promise<{ context: string; companies: string[] }> {
    console.log('[VERCEL LOG] Searching placements namespace with query:', query);
    
    // Generate embedding for the query
    const queryEmbedding = await generateEmbedding(query);
    console.log('[VERCEL LOG] Generated embedding, dimension:', queryEmbedding.length);
    
    const results = await pineconeIndex.namespace('placements').query({
        vector: queryEmbedding,
            topK: PINECONE_TOP_K,
        includeMetadata: true,
    });

    console.log('[VERCEL LOG] Placements namespace raw results:', {
        hasResults: !!results,
        hasMatches: !!(results && results.matches),
        matchesCount: results?.matches?.length || 0,
        firstMatchId: results?.matches?.[0]?.id || 'none',
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
    
    // Generate embedding for the query
    const queryEmbedding = await generateEmbedding(query);
    console.log('[VERCEL LOG] Generated embedding for stats, dimension:', queryEmbedding.length);
    
    const results = await pineconeIndex.namespace('placement_stats').query({
        vector: queryEmbedding,
        topK: PINECONE_TOP_K,
        includeMetadata: true,
    });

    console.log('[VERCEL LOG] Placement_stats namespace raw results:', {
        hasResults: !!results,
        hasMatches: !!(results && results.matches),
        matchesCount: results?.matches?.length || 0,
        firstMatchId: results?.matches?.[0]?.id || 'none',
    });

    // query() returns { matches: [...] } where each match has { id, score, metadata }
    const matches = results?.matches || [];
    
    console.log('[VERCEL LOG] Placement_stats namespace parsed matches:', {
        matchesCount: matches.length,
        firstMatchMetadata: matches[0]?.metadata || 'none',
    });

    if (matches.length === 0) {
        console.log('[VERCEL LOG] No matches found in placement_stats namespace');
        return '';
    }

    const lines: string[] = [];
    for (const match of matches) {
        // query() returns matches with metadata directly
        const metadata = match.metadata || {};
        const text = metadata.text || '';
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

async function searchTranscriptsNamespace(query: string): Promise<string> {
    console.log('[VERCEL LOG] Searching transcripts namespace with query:', query);
    
    // Generate embedding for the query
    const queryEmbedding = await generateEmbedding(query);
    console.log('[VERCEL LOG] Generated embedding for transcripts, dimension:', queryEmbedding.length);
    
    const results = await pineconeIndex.namespace('transcripts').query({
        vector: queryEmbedding,
        topK: PINECONE_TOP_K,
        includeMetadata: true,
    });

    console.log('[VERCEL LOG] Transcripts namespace raw results:', {
        hasResults: !!results,
        hasMatches: !!(results && results.matches),
        matchesCount: results?.matches?.length || 0,
        firstMatchId: results?.matches?.[0]?.id || 'none',
    });

    const matches = results?.matches || [];
    
    console.log('[VERCEL LOG] Transcripts namespace parsed matches:', {
        matchesCount: matches.length,
        firstMatchMetadata: matches[0]?.metadata || 'none',
    });

    if (matches.length === 0) {
        console.log('[VERCEL LOG] No matches found in transcripts namespace');
        return '';
    }

    // Format transcripts with company, interviewee, and transcript text
    const transcriptEntries: string[] = [];
    for (const match of matches) {
        const metadata = match.metadata || {};
        const company = String(metadata.company || 'Unknown');
        const interviewee = String(metadata.interviewee || 'Unknown');
        const transcript = String(metadata.transcript || '');
        
        // Safely extract chunk info
        const totalChunks = typeof metadata.total_chunks === 'number' ? metadata.total_chunks : 
                           typeof metadata.total_chunks === 'string' ? parseInt(metadata.total_chunks, 10) : 1;
        const chunkIndex = typeof metadata.chunk_index === 'number' ? metadata.chunk_index :
                          typeof metadata.chunk_index === 'string' ? parseInt(metadata.chunk_index, 10) : 0;
        
        const chunkInfo = totalChunks > 1 
            ? ` (chunk ${chunkIndex + 1}/${totalChunks})`
            : '';
        
        if (transcript) {
            transcriptEntries.push(
                `Company: ${company}\n` +
                `Interviewee: ${interviewee}${chunkInfo}\n` +
                `Transcript:\n${transcript}`
            );
        }
    }

    console.log('[VERCEL LOG] Transcripts namespace formatted entries:', {
        entriesCount: transcriptEntries.length,
    });

    if (transcriptEntries.length === 0) {
        return '';
    }

    return `<transcripts_results>
${transcriptEntries.join('\n\n---\n\n')}
</transcripts_results>`;
}

function isValidLinkedInProfile(metadata: Record<string, unknown>): boolean {
    const name = String(metadata.name || '').trim().toLowerCase();
    if (!name || name === 'unknown') return false;
    if (['people you may know', 'you might like', 'endorsements'].some((noise) => name.includes(noise))) {
        return false;
    }

    const url = String(metadata.linkedin_url || '').toLowerCase();
    if (!url) return false;
    // Ignore recommendation overlays which usually contain '/overlay/' in the URL
    if (url.includes('/overlay/')) return false;

    return true;
}

async function searchLinkedInProfilesNamespace(query: string): Promise<string> {
    console.log('[VERCEL LOG] Searching linkedin_profiles namespace with query:', query);

    const queryEmbedding = await generateEmbedding(query);
    const results = await pineconeIndex.namespace('linkedin_profiles').query({
        vector: queryEmbedding,
        topK: 6,
        includeMetadata: true,
    });

    const matches = (results?.matches || []).filter((match) => isValidLinkedInProfile(match.metadata || {})).slice(0, 3);

    if (matches.length === 0) {
        console.log('[VERCEL LOG] No valid LinkedIn matches found');
        return '';
    }

    const profiles = matches.map((match, idx) => {
        const metadata = match.metadata || {};
        const name = String(metadata.name || 'Unknown');
        const url = String(metadata.linkedin_url || 'N/A');
        const companies = Array.isArray(metadata.past_companies) ? metadata.past_companies.filter(Boolean).join(', ') : '';
        const companiesText = companies || 'Past companies not available';
        return `# Profile ${idx + 1}
Name: ${name}
LinkedIn: ${url}
Past companies: ${companiesText}`;
    });

    return `<linkedin_profiles_results>
${profiles.join('\n\n')}
</linkedin_profiles_results>`;
}

export async function searchPinecone(
    query: string,
): Promise<PlacementNamespacesResult> {
    console.log('[VERCEL LOG] Starting searchPinecone with query:', query);
    const [placements, placementStats, transcripts, linkedinProfiles] = await Promise.all([
        searchPlacementsNamespace(query),
        searchPlacementStatsNamespace(query),
        searchTranscriptsNamespace(query),
        searchLinkedInProfilesNamespace(query),
    ]);

    console.log('[VERCEL LOG] Initial search results:', {
        placementsCompaniesCount: placements.companies.length,
        placementsContextLength: placements.context.length,
        placementStatsContextLength: placementStats.length,
        transcriptsContextLength: transcripts.length,
        linkedinProfilesLength: linkedinProfiles.length,
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
                transcriptsContext: transcripts,
                linkedinProfilesContext: linkedinProfiles,
            };
        }
    }

    const finalResult = {
        placementsContext: placements.context,
        placementCompanies: placements.companies,
        placementStatsContext: placementStats,
        transcriptsContext: transcripts,
        linkedinProfilesContext: linkedinProfiles,
    };

    console.log('[VERCEL LOG] Final searchPinecone result:', {
        placementsContextLength: finalResult.placementsContext.length,
        placementCompaniesCount: finalResult.placementCompanies.length,
        placementCompanies: finalResult.placementCompanies,
        placementStatsContextLength: finalResult.placementStatsContext.length,
        transcriptsContextLength: finalResult.transcriptsContext.length,
        linkedinProfilesContextLength: finalResult.linkedinProfilesContext.length,
    });

    return finalResult;
}

function parsePlacementText(text: string) {
    const entry: PlacementListing = {
        id: '',
        company: '',
        role: '',
    };

    text.split('\n').forEach(line => {
        const normalized = line.trim();
        if (!normalized) return;
        const [rawKey, ...rest] = normalized.split(':');
        const key = rawKey?.toLowerCase() || '';
        const value = rest.join(':').trim();

        switch (true) {
            case key.includes('company'):
                entry.company = value;
                break;
            case key.includes('role') || key.includes('job title'):
                entry.role = value;
                break;
            case key.includes('location'):
                entry.location = value;
                break;
            case key.includes('compensation') || key.includes('ctc') || key.includes('job_package'):
                entry.jobPackage = value;
                break;
            case key.includes('publish date'):
                entry.publishDate = value;
                break;
            case key.includes('deadline'):
                entry.deadline = value;
                break;
            default:
                break;
        }
    });

    entry.description = text;
    return entry;
}

export async function fetchPlacementListings(limit = 100): Promise<PlacementListing[]> {
    const now = new Date();
    const queryEmbedding = await generateEmbedding('List of BITSoM placement job postings');
    const results = await pineconeIndex.namespace('placements').query({
        vector: queryEmbedding,
        topK: limit,
        includeMetadata: true,
    });

    const matches = results?.matches || [];
    const parsed = matches.map((match) => {
        const metadata = match.metadata || {};
        const text = String(metadata.text || '');
        const parsed = parsePlacementText(text);
        const deadline = parsed.deadline ? new Date(parsed.deadline) : undefined;
        const isOpen = deadline ? deadline >= now : true;
        return {
            sourceName: metadata.source_name ? String(metadata.source_name) : undefined,
            sourceUrl: metadata.source_url ? String(metadata.source_url) : undefined,
            isOpen,
            ...parsed,
            id: match.id || randomUUID(),
        };
    });

    return parsed.sort((a, b) => {
        if (a.isOpen === b.isOpen) return 0;
        return a.isOpen ? -1 : 1;
    });
}
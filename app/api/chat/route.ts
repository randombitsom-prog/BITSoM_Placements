
import { streamText, UIMessage, convertToModelMessages, stepCountIs, createUIMessageStream, createUIMessageStreamResponse } from 'ai';
import { MODEL } from '@/config';
import { SYSTEM_PROMPT } from '@/prompts';
import { isContentFlagged } from '@/lib/moderation';
import { searchPinecone } from '@/lib/pinecone';
import { webSearch } from './tools/web-search';

export const maxDuration = 60;
export async function POST(req: Request) {
    const { messages }: { messages: UIMessage[] } = await req.json();

    const latestUserMessage = messages
        .filter(msg => msg.role === 'user')
        .pop();

    let latestUserText = '';

    if (latestUserMessage) {
        const textParts = latestUserMessage.parts
            .filter(part => part.type === 'text')
            .map(part => 'text' in part ? part.text : '')
            .join('');

        latestUserText = textParts;

        if (textParts) {
            const moderationResult = await isContentFlagged(textParts);

            if (moderationResult.flagged) {
                const stream = createUIMessageStream({
                    execute({ writer }) {
                        const textId = 'moderation-denial-text';

                        writer.write({
                            type: 'start',
                        });

                        writer.write({
                            type: 'text-start',
                            id: textId,
                        });

                        writer.write({
                            type: 'text-delta',
                            id: textId,
                            delta: moderationResult.denialMessage || "Your message violates our guidelines. I can't answer that.",
                        });

                        writer.write({
                            type: 'text-end',
                            id: textId,
                        });

                        writer.write({
                            type: 'finish',
                        });
                    },
                });

                return createUIMessageStreamResponse({ stream });
            }
        }
    }

    // Always fetch placement context from Pinecone for the latest user query.
    let placementsContext = '';
    let pineconeCompanies: string[] = [];
    let placementStatsContext = '';
    let transcriptsContext = '';
    let hasPineconeResults = false;

    if (latestUserText) {
        console.log('[VERCEL LOG] User query:', latestUserText);
        try {
            const pineconeResult = await searchPinecone(latestUserText);
            placementsContext = pineconeResult.placementsContext;
            pineconeCompanies = pineconeResult.placementCompanies || [];
            placementStatsContext = pineconeResult.placementStatsContext || '';
            transcriptsContext = pineconeResult.transcriptsContext || '';
            
            // Check if we have any Pinecone results
            hasPineconeResults = !!(
                placementsContext.trim() ||
                pineconeCompanies.length > 0 ||
                placementStatsContext.trim() ||
                transcriptsContext.trim()
            );
            
            // Comprehensive logging for Vercel runtime
            console.log('[VERCEL LOG] Pinecone search completed:', {
                query: latestUserText,
                hasResults: hasPineconeResults,
                placementsContextLength: placementsContext.length,
                placementsContextPreview: placementsContext.substring(0, 200) + (placementsContext.length > 200 ? '...' : ''),
                companiesCount: pineconeCompanies.length,
                companies: pineconeCompanies,
                placementStatsContextLength: placementStatsContext.length,
                placementStatsContextPreview: placementStatsContext.substring(0, 200) + (placementStatsContext.length > 200 ? '...' : ''),
                transcriptsContextLength: transcriptsContext.length,
                transcriptsContextPreview: transcriptsContext.substring(0, 200) + (transcriptsContext.length > 200 ? '...' : ''),
            });
        } catch (error) {
            // Fail open: if Pinecone is unavailable, still answer without RAG context.
            console.error('[VERCEL LOG] Pinecone search error:', {
                query: latestUserText,
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
            });
            placementsContext = '';
            pineconeCompanies = [];
            placementStatsContext = '';
            transcriptsContext = '';
            hasPineconeResults = false;
        }
    }

    // Truncate contexts to stay within token limits
    // Rough estimate: 1 token ≈ 4 characters, so 25,000 tokens ≈ 100,000 chars
    // Reserve space for system prompt (~2000 chars) and user messages
    const MAX_CONTEXT_CHARS = 80000; // Conservative limit to stay under 30k tokens
    
    function truncateContext(text: string, maxChars: number): string {
        if (!text || text.length <= maxChars) return text;
        return text.substring(0, maxChars) + '\n\n[... context truncated for length ...]';
    }
    
    // Allocate space proportionally, but prioritize companies list and placements
    const companiesList = pineconeCompanies.join(', ');
    const companiesListChars = companiesList.length;
    const remainingChars = Math.max(0, MAX_CONTEXT_CHARS - companiesListChars);
    
    // Split remaining space: 40% placements, 30% stats, 30% transcripts
    const placementsMax = Math.floor(remainingChars * 0.4);
    const statsMax = Math.floor(remainingChars * 0.3);
    const transcriptsMax = Math.floor(remainingChars * 0.3);
    
    const truncatedPlacements = truncateContext(placementsContext, placementsMax);
    const truncatedStats = truncateContext(placementStatsContext, statsMax);
    const truncatedTranscripts = truncateContext(transcriptsContext, transcriptsMax);

    // Add web search instruction based on Pinecone results
    const webSearchInstruction = !hasPineconeResults 
        ? '\n\n<web_search_fallback>\n⚠️ IMPORTANT: The Pinecone database returned NO results for this query. You MUST use the "webSearch" tool to find information from the web.\n</web_search_fallback>'
        : '\n\n<web_search_fallback>\n✅ Pinecone database has some results. PRIORITY RULES:\n1. FIRST: Use Pinecone context to answer questions about BITSoM placements, companies, students, compensation, interview transcripts.\n2. SECOND: If the user asks for information NOT in Pinecone (e.g., LinkedIn profiles, current company websites, real-time news, external resources), you MAY use the "webSearch" tool.\n3. The webSearch tool is available - use it when Pinecone data doesn\'t answer the specific question asked.\n</web_search_fallback>';

    const combinedSystemPrompt = `
${SYSTEM_PROMPT}

<placements_namespace_context>
${truncatedPlacements}
</placements_namespace_context>

<placement_companies_list>
${companiesList}
</placement_companies_list>

<placement_stats_namespace_context>
${truncatedStats}
</placement_stats_namespace_context>

<transcripts_namespace_context>
${truncatedTranscripts}
</transcripts_namespace_context>
${webSearchInstruction}
`;

    // Log what's being sent to OpenAI
    console.log('[VERCEL LOG] System prompt context summary:', {
        hasPineconeResults: hasPineconeResults,
        webSearchEnabled: true, // Always enabled now
        hasPlacementsContext: !!placementsContext,
        placementsOriginalLength: placementsContext.length,
        placementsTruncatedLength: truncatedPlacements.length,
        companiesList: pineconeCompanies.join(', ') || '(empty)',
        companiesCount: pineconeCompanies.length,
        hasStatsContext: !!placementStatsContext,
        statsOriginalLength: placementStatsContext.length,
        statsTruncatedLength: truncatedStats.length,
        hasTranscriptsContext: !!transcriptsContext,
        transcriptsOriginalLength: transcriptsContext.length,
        transcriptsTruncatedLength: truncatedTranscripts.length,
        combinedPromptLength: combinedSystemPrompt.length,
        estimatedTokens: Math.ceil(combinedSystemPrompt.length / 4), // Rough estimate
    });

    // Always enable webSearch tool, but AI will prioritize Pinecone based on instructions
    const streamTextConfig: any = {
        model: MODEL,
        system: combinedSystemPrompt,
        messages: convertToModelMessages(messages),
        tools: { webSearch }, // Always available
        stopWhen: stepCountIs(10),
        providerOptions: {
            openai: {
                reasoningSummary: 'auto',
                reasoningEffort: 'low',
                parallelToolCalls: false,
            }
        }
    };

    console.log('[VERCEL LOG] Web search tool always enabled (AI will prioritize Pinecone when relevant)');

    const result = streamText(streamTextConfig);

    return result.toUIMessageStreamResponse({
        sendReasoning: true,
    });
}

import { streamText, UIMessage, convertToModelMessages, stepCountIs, createUIMessageStream, createUIMessageStreamResponse } from 'ai';
import { MODEL } from '@/config';
import { SYSTEM_PROMPT } from '@/prompts';
import { isContentFlagged } from '@/lib/moderation';
import { searchPinecone } from '@/lib/pinecone';

export const maxDuration = 30;
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

    if (latestUserText) {
        console.log('[VERCEL LOG] User query:', latestUserText);
        try {
            const pineconeResult = await searchPinecone(latestUserText);
            placementsContext = pineconeResult.placementsContext;
            pineconeCompanies = pineconeResult.placementCompanies || [];
            placementStatsContext = pineconeResult.placementStatsContext || '';
            
            // Comprehensive logging for Vercel runtime
            console.log('[VERCEL LOG] Pinecone search completed:', {
                query: latestUserText,
                placementsContextLength: placementsContext.length,
                placementsContextPreview: placementsContext.substring(0, 200) + (placementsContext.length > 200 ? '...' : ''),
                companiesCount: pineconeCompanies.length,
                companies: pineconeCompanies,
                placementStatsContextLength: placementStatsContext.length,
                placementStatsContextPreview: placementStatsContext.substring(0, 200) + (placementStatsContext.length > 200 ? '...' : ''),
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
        }
    }

    const combinedSystemPrompt = `
${SYSTEM_PROMPT}

<placements_namespace_context>
${placementsContext}
</placements_namespace_context>

<placement_companies_list>
${pineconeCompanies.join(', ')}
</placement_companies_list>

<placement_stats_namespace_context>
${placementStatsContext}
</placement_stats_namespace_context>
`;

    // Log what's being sent to OpenAI
    console.log('[VERCEL LOG] System prompt context summary:', {
        hasPlacementsContext: !!placementsContext,
        companiesList: pineconeCompanies.join(', ') || '(empty)',
        hasStatsContext: !!placementStatsContext,
        combinedPromptLength: combinedSystemPrompt.length,
    });

    const result = streamText({
        model: MODEL,
        system: combinedSystemPrompt,
        messages: convertToModelMessages(messages),
        stopWhen: stepCountIs(10),
        providerOptions: {
            openai: {
                reasoningSummary: 'auto',
                reasoningEffort: 'low',
                parallelToolCalls: false,
            }
        }
    });

    return result.toUIMessageStreamResponse({
        sendReasoning: true,
    });
}
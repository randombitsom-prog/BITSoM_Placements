
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
    let pineconeContext = '';
    let pineconeCompanies: string[] = [];

    if (latestUserText) {
        try {
            const pineconeResult = await searchPinecone(latestUserText);
            pineconeContext = pineconeResult.context;
            pineconeCompanies = pineconeResult.companies || [];
        } catch (error) {
            // Fail open: if Pinecone is unavailable, still answer without RAG context.
            pineconeContext = '';
            pineconeCompanies = [];
        }
    }

    const combinedSystemPrompt = `
${SYSTEM_PROMPT}

<placement_rag_context>
${pineconeContext}
</placement_rag_context>

<placement_companies_list>
${pineconeCompanies.join(', ')}
</placement_companies_list>
`;

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
"use client";

import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, Bot, User, Minimize2, Maximize2 } from 'lucide-react';

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'bot';
  timestamp: Date;
}

const cleanResponseText = (text: string) => {
  if (!text) return '';
  let cleaned = text.replace(/\*\*/g, '');
  cleaned = cleaned.replace(/--/g, '');
  cleaned = cleaned.replace(/\$/g, '₹');
  cleaned = cleaned.replace(/\[(.*?)\]\((.*?)\)/g, '$1');
  cleaned = cleaned.replace(/Sources?:[\s\S]*$/i, '').trim();
  return cleaned;
};

const WELCOME_MESSAGE: Message = {
  id: 'welcome-1',
  text: "Hi! I'm PlaceBot. I can help you with previous year interview transcripts, preparation tips, company insights, and more. How can I assist you today?",
  sender: 'bot',
  timestamp: new Date(),
};

type ChatBotProps = {
  onExpandChange?: (expanded: boolean) => void;
};

export default function ChatBot({ onExpandChange }: ChatBotProps) {
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const [messages, setMessages] = useState<Message[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    if (scrollAreaRef.current) {
      const viewport = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (viewport) {
        viewport.scrollTop = viewport.scrollHeight;
      }
    }
  }, [messages]);

  useEffect(() => {
    onExpandChange?.(isExpanded);
  }, [isExpanded, onExpandChange]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
  };

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      text: text.trim(),
      sender: 'user',
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    // Create a placeholder for the bot's response with loading message
    const botMessageId = `bot-${Date.now()}`;
    const botMessage: Message = {
      id: botMessageId,
      text: 'Fetching latest data...',
      sender: 'bot',
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, botMessage]);

    try {
      // Convert messages to UIMessage format
      const uiMessages = messages
        .filter(msg => msg.id !== WELCOME_MESSAGE.id)
        .map(msg => ({
          id: msg.id,
          role: msg.sender === 'user' ? 'user' : 'assistant',
          parts: [
            {
              type: 'text',
              text: msg.text,
            },
          ],
        }));

      uiMessages.push({
        id: `user-${Date.now()}`,
        role: 'user',
        parts: [
          {
            type: 'text',
            text: text.trim(),
          },
        ],
      });

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ messages: uiMessages }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        console.error('API Error:', response.status, errorText);
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Check if response is a timeout or error
      if (response.status === 504 || response.status === 408) {
        throw new Error('Request timeout - the response took too long. Please try again.');
      }

      // Check content type to determine how to parse
      const contentType = response.headers.get('content-type') || '';
      const isStreaming = contentType.includes('text/event-stream') || contentType.includes('text/plain');

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let accumulatedText = '';
      let buffer = '';
      let hasReceivedData = false;
      let eventCount = 0;

      if (!reader) {
        throw new Error('No response body');
      }

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          buffer += chunk;
          
          // Process complete lines
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep incomplete line in buffer

          for (const line of lines) {
            if (!line.trim()) continue;
            
            // Log first few lines to debug
            if (eventCount < 5) {
              console.log('Stream line:', line.substring(0, 200));
            }
            
            try {
              // UI message stream format: lines start with "0:" followed by JSON
              let data: any = null;
              let jsonStr = '';
              
              if (line.startsWith('0:')) {
                jsonStr = line.slice(2);
              } else if (line.startsWith('data: ')) {
                // SSE format
                jsonStr = line.slice(6);
              } else if (line.startsWith('{')) {
                // Direct JSON
                jsonStr = line;
              } else {
                continue;
              }

              data = JSON.parse(jsonStr);
              eventCount++;
              
              // Log first few events to debug
              if (eventCount <= 5) {
                console.log('Stream event:', data.type, data);
              }
              
              // Handle text-delta events (streaming text chunks)
              if (data.type === 'text-delta' && data.delta) {
                if (!hasReceivedData) {
                  accumulatedText = '';
                  hasReceivedData = true;
                }
                accumulatedText += data.delta;
                const cleanedDelta = cleanResponseText(accumulatedText);
                setMessages(prev =>
                  prev.map(msg =>
                    msg.id === botMessageId
                      ? { ...msg, text: cleanedDelta }
                      : msg
                  )
                );
              }
              // Handle text-start (reset accumulated text when new text starts)
              else if (data.type === 'text-start') {
                accumulatedText = '';
                hasReceivedData = true;
                const cleanedStart = cleanResponseText(accumulatedText);
                setMessages(prev =>
                  prev.map(msg =>
                    msg.id === botMessageId
                      ? { ...msg, text: cleanedStart }
                      : msg
                  )
                );
              }
              // Handle text (complete text block)
              else if (data.type === 'text' && data.text) {
                accumulatedText = data.text;
                const cleanedText = cleanResponseText(accumulatedText);
                hasReceivedData = true;
                setMessages(prev =>
                  prev.map(msg =>
                    msg.id === botMessageId
                      ? { ...msg, text: cleanedText }
                      : msg
                  )
                );
              }
              // Handle message updates with full text
              else if (data.type === 'message' && data.message) {
                const message = data.message;
                if (message.parts) {
                  const textParts = message.parts
                    .filter((part: { type?: string; text?: string }) => part.type === 'text')
                    .map((part: { text?: string }) => part.text || '')
                    .join('');
                  if (textParts) {
                    accumulatedText = textParts;
                    const cleanedParts = cleanResponseText(accumulatedText);
                    hasReceivedData = true;
                    setMessages(prev =>
                      prev.map(msg =>
                        msg.id === botMessageId
                          ? { ...msg, text: cleanedParts }
                          : msg
                      )
                    );
                  }
                }
              }
              // Handle finish event
              else if (data.type === 'finish') {
                // Stream is complete
              }
              // Handle start event
              else if (data.type === 'start') {
                // Stream started
              }
            } catch (e) {
              // Skip invalid JSON lines - might be partial data
              // Only log if it looks like it might be important
              if (line.length > 10 && (line.includes('text') || line.includes('delta') || line.includes('message'))) {
                console.log('Failed to parse line:', line.substring(0, 200));
              }
            }
          }
        }

        // Process any remaining buffer
        if (buffer.trim()) {
          try {
            let jsonStr = buffer.trim();
            if (jsonStr.startsWith('0:')) {
              jsonStr = jsonStr.slice(2);
            } else if (jsonStr.startsWith('data: ')) {
              jsonStr = jsonStr.slice(6);
            }
            const data = JSON.parse(jsonStr);
            if (data.type === 'text-delta' && data.delta) {
              if (!hasReceivedData) {
                accumulatedText = '';
                hasReceivedData = true;
              }
              accumulatedText += data.delta;
            }
          } catch (e) {
            // Ignore buffer parse errors
          }
        }

        console.log(`Stream complete. Events: ${eventCount}, Has data: ${hasReceivedData}, Text length: ${accumulatedText.length}`);
      } catch (streamError: any) {
        console.error('Stream reading error:', streamError);
        // If stream fails, try to get response as text
        if (!hasReceivedData) {
          throw new Error('Failed to read stream response');
        }
      }

      // Process any remaining buffer
      if (buffer.trim() && buffer.startsWith('0:')) {
        try {
          const data = JSON.parse(buffer.slice(2));
          if (data.type === 'text-delta' && data.delta) {
            if (!hasReceivedData) {
              accumulatedText = '';
              hasReceivedData = true;
            }
            accumulatedText += data.delta;
          }
        } catch (e) {
          // Ignore
        }
      }

      // Final update - ensure we have the complete text
      if (accumulatedText) {
        const cleanedFinal = cleanResponseText(accumulatedText);
        setMessages(prev =>
          prev.map(msg =>
            msg.id === botMessageId
              ? { ...msg, text: cleanedFinal }
              : msg
          )
        );
      } else if (!hasReceivedData) {
        // If we got events but no text, the stream might have completed without text-delta events
        // Check if we have any text in the final message
        const finalMessage = messages.find(msg => msg.id === botMessageId);
        if (!finalMessage || !finalMessage.text || finalMessage.text === 'Fetching latest data...') {
          setMessages(prev =>
            prev.map(msg =>
              msg.id === botMessageId
                ? { ...msg, text: 'No response received. The request may have timed out. Please try again.' }
                : msg
            )
          );
        }
      }
    } catch (error: any) {
      console.error('Error sending message:', error);
      setMessages(prev =>
        prev.map(msg =>
          msg.id === botMessageId
            ? { ...msg, text: 'Sorry, I encountered an error. Please try again.' }
            : msg
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickAction = (action: string) => {
    setInput(action);
    sendMessage(action);
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isLoading) {
      sendMessage(input);
    }
  };

  return (
    <Card
      className={`flex flex-col bg-gradient-to-br from-slate-800 to-slate-900 border-slate-700/50 shadow-xl overflow-hidden transition-all duration-300 ${
        isExpanded
          ? 'fixed inset-0 z-50 w-[90vw] max-w-[1800px] h-[90vh] rounded-3xl left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2'
          : 'h-[calc(100vh-120px)] sticky top-4 rounded-3xl'
      }`}
    >
      <CardHeader className="p-0 border-b border-slate-700/50">
        <div className="bg-gradient-to-br from-orange-500 to-orange-700 rounded-t-3xl px-6 py-5 flex items-center gap-3 justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-white/20 rounded-2xl backdrop-blur-sm shadow-sm">
              <Bot className="h-6 w-6 text-white" />
            </div>
            <div className="flex flex-col text-white leading-tight">
              <CardTitle className="text-lg font-semibold">PlaceBot Assistant</CardTitle>
              <p className="text-xs text-orange-100 font-medium">Always here to help you</p>
            </div>
          </div>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-2 rounded-xl bg-white/20 text-white hover:bg-white/30 transition flex items-center gap-1 text-xs"
          >
            {isExpanded ? (
              <>
                <Minimize2 className="h-4 w-4" /> <span>Collapse</span>
              </>
            ) : (
              <>
                <Maximize2 className="h-4 w-4" /> <span>Expand</span>
              </>
            )}
          </button>
        </div>
      </CardHeader>
      <CardContent className="relative flex-1 flex flex-col p-0 overflow-hidden">
        <ScrollArea className="flex-1 h-full p-4 bg-slate-950/50" ref={scrollAreaRef}>
          <div className="space-y-4 pb-32">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex gap-3 ${
                  message.sender === 'user' ? 'justify-end' : 'justify-start'
                } animate-in fade-in slide-in-from-bottom-2 duration-300`}
              >
                {message.sender === 'bot' && (
                  <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center shadow-lg shadow-orange-500/30">
                    <Bot className="h-5 w-5 text-white" />
                  </div>
                )}
                <div
                  className={`max-w-[75%] rounded-2xl p-4 ${
                    message.sender === 'user'
                      ? 'bg-gradient-to-br from-blue-600 to-blue-700 text-white shadow-lg shadow-blue-500/20'
                      : 'bg-slate-800/80 text-slate-100 border border-slate-700/50 shadow-lg'
                  }`}
                >
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">
                    {message.text}
                  </p>
                  {message.text && (
                    <p className="text-xs mt-2 opacity-60">
                      {message.timestamp.toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  )}
                </div>
                {message.sender === 'user' && (
                  <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-gradient-to-br from-slate-600 to-slate-700 flex items-center justify-center shadow-lg">
                    <User className="h-5 w-5 text-slate-200" />
                  </div>
                )}
              </div>
            ))}
            {isLoading && messages[messages.length - 1]?.sender === 'user' && (
              <div className="flex gap-3 justify-start">
                <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center shadow-lg shadow-orange-500/30">
                  <Bot className="h-5 w-5 text-white" />
                </div>
                <div className="bg-slate-800/80 text-slate-100 border border-slate-700/50 shadow-lg rounded-2xl p-4">
                  <div className="flex gap-1">
                    <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                    <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                    <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
        <div className="sticky bottom-0 p-4 border-t border-slate-700/50 bg-slate-900/70 backdrop-blur supports-[backdrop-filter]:bg-slate-900/60">
          <form onSubmit={onSubmit} className="flex gap-2 mb-3">
            <Input
              placeholder="Type your question here..."
              value={input}
              onChange={handleInputChange}
              className="bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500 focus:border-orange-500 focus:ring-orange-500 h-11 rounded-xl"
              disabled={isLoading}
            />
            <Button 
              type="submit"
              disabled={isLoading || !input.trim()}
              className="bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 h-11 w-11 rounded-xl shadow-lg shadow-orange-500/30"
            >
              <Send className="h-4 w-4" />
            </Button>
          </form>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleQuickAction("Show McKinsey interview transcript")}
              className="bg-slate-800/50 border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white hover:border-orange-500/50 rounded-lg text-xs"
              disabled={isLoading}
            >
              McKinsey Interview
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleQuickAction("Consulting preparation tips")}
              className="bg-slate-800/50 border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white hover:border-orange-500/50 rounded-lg text-xs"
              disabled={isLoading}
            >
              Prep Tips
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleQuickAction("Tell me about CTC stats")}
              className="bg-slate-800/50 border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white hover:border-orange-500/50 rounded-lg text-xs"
              disabled={isLoading}
            >
              CTC Info
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

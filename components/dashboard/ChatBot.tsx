"use client";

import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, Bot, User } from 'lucide-react';

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'bot';
  timestamp: Date;
}

const WELCOME_MESSAGE: Message = {
  id: 'welcome-1',
  text: "Hi! I'm PlaceBot. I can help you with previous year interview transcripts, preparation tips, company insights, and more. How can I assist you today?",
  sender: 'bot',
  timestamp: new Date(),
};

export default function ChatBot() {
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const [messages, setMessages] = useState<Message[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [messages]);

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

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let accumulatedText = '';
      let buffer = '';
      let hasReceivedData = false;

      if (!reader) {
        throw new Error('No response body');
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          
          try {
            // UI message stream format: lines start with "0:" followed by JSON
            if (line.startsWith('0:')) {
              const data = JSON.parse(line.slice(2));
              
              // Handle text-delta events (streaming text chunks)
              if (data.type === 'text-delta' && data.delta) {
                if (!hasReceivedData) {
                  accumulatedText = '';
                  hasReceivedData = true;
                }
                accumulatedText += data.delta;
                setMessages(prev =>
                  prev.map(msg =>
                    msg.id === botMessageId
                      ? { ...msg, text: accumulatedText }
                      : msg
                  )
                );
              }
              // Handle text-start (reset accumulated text when new text starts)
              else if (data.type === 'text-start') {
                accumulatedText = '';
                hasReceivedData = true;
                setMessages(prev =>
                  prev.map(msg =>
                    msg.id === botMessageId
                      ? { ...msg, text: '' }
                      : msg
                  )
                );
              }
              // Handle text (complete text block)
              else if (data.type === 'text' && data.text) {
                accumulatedText = data.text;
                hasReceivedData = true;
                setMessages(prev =>
                  prev.map(msg =>
                    msg.id === botMessageId
                      ? { ...msg, text: accumulatedText }
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
                    hasReceivedData = true;
                    setMessages(prev =>
                      prev.map(msg =>
                        msg.id === botMessageId
                          ? { ...msg, text: accumulatedText }
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
            }
          } catch (e) {
            // Skip invalid JSON lines - might be partial data
          }
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

      // Final update
      if (accumulatedText) {
        setMessages(prev =>
          prev.map(msg =>
            msg.id === botMessageId
              ? { ...msg, text: accumulatedText }
              : msg
          )
        );
      } else if (!hasReceivedData) {
        setMessages(prev =>
          prev.map(msg =>
            msg.id === botMessageId
              ? { ...msg, text: 'No response received. Please try again.' }
              : msg
          )
        );
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
    <Card className="h-[calc(100vh-120px)] flex flex-col sticky top-4 bg-gradient-to-br from-slate-800 to-slate-900 border-slate-700/50 shadow-xl">
      <CardHeader className="border-b border-slate-700/50 bg-gradient-to-r from-orange-600 to-orange-700">
        <CardTitle className="flex items-center gap-3 text-white">
          <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
            <Bot className="h-5 w-5 text-white" />
          </div>
          <div>
            <div>PlaceBot Assistant</div>
            <p className="text-xs text-orange-100 font-normal mt-0.5">
              Always here to help you
            </p>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col p-0">
        <ScrollArea className="flex-1 p-4 bg-slate-950/50" ref={scrollAreaRef}>
          <div className="space-y-4">
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
        <div className="p-4 border-t border-slate-700/50 bg-slate-900/50">
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

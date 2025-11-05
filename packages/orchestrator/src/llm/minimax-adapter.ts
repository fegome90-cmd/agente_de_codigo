/**
 * MiniMax M2 API Adapter
 * Integrates MiniMax M2 LLM API with the orchestrator system
 */

import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { EventEmitter } from 'events';

interface MiniMaxMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface MiniMaxRequest {
  model: string;
  messages: MiniMaxMessage[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  stream?: boolean;
  mask_sensitive_info?: boolean;
}

interface MiniMaxResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: 'assistant';
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface MiniMaxStreamChunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string;
    };
    finish_reason?: string;
  }>;
}

export class MiniMaxAdapter extends EventEmitter {
  private apiKey: string;
  private baseURL: string;
  private model: string;
  private temperature: number;
  private maxTokens: number;
  private timeout: number;
  private client: AxiosInstance;

  constructor(config: {
    apiKey: string;
    baseURL?: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    timeout?: number;
  }) {
    super();

    this.apiKey = config.apiKey;
    this.baseURL = config.baseURL || 'https://api.minimax.chat/v1';
    this.model = config.model || 'abab6.5s-chat';
    this.temperature = config.temperature || 0.7;
    this.maxTokens = config.maxTokens || 4096;
    this.timeout = config.timeout || 60000;

    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: this.timeout,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Generate a chat completion
   */
  async chatCompletion(
    messages: MiniMaxMessage[],
    options: {
      temperature?: number;
      maxTokens?: number;
      stream?: boolean;
    } = {}
  ): Promise<MiniMaxResponse> {
    const request: MiniMaxRequest = {
      model: this.model,
      messages,
      temperature: options.temperature ?? this.temperature,
      max_tokens: options.maxTokens ?? this.maxTokens,
      stream: false,
      mask_sensitive_info: true,
    };

    try {
      const response = await this.client.post<MiniMaxResponse>(
        '/text/chatcompletion_pro',
        request
      );

      this.emit('completion', response.data);
      return response.data;
    } catch (error) {
      this.handleError(error);
      throw error;
    }
  }

  /**
   * Generate a streaming chat completion
   */
  async *streamChatCompletion(
    messages: MiniMaxMessage[],
    options: {
      temperature?: number;
      maxTokens?: number;
    } = {}
  ): AsyncGenerator<string, void, unknown> {
    const request: MiniMaxRequest = {
      model: this.model,
      messages,
      temperature: options.temperature ?? this.temperature,
      max_tokens: options.maxTokens ?? this.maxTokens,
      stream: true,
      mask_sensitive_info: true,
    };

    try {
      const response = await this.client.post(
        '/text/chatcompletion_pro',
        request,
        {
          responseType: 'stream',
        }
      );

      let buffer = '';

      for await (const chunk of response.data) {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              return;
            }

            try {
              const parsed: MiniMaxStreamChunk = JSON.parse(data);
              const delta = parsed.choices[0]?.delta;

              if (delta?.content) {
                this.emit('token', delta.content);
                yield delta.content;
              }

              if (parsed.choices[0]?.finish_reason) {
                this.emit('done', parsed);
                return;
              }
            } catch (parseError) {
              // Ignore parsing errors for malformed chunks
              console.warn('Failed to parse streaming chunk:', parseError);
            }
          }
        }
      }
    } catch (error) {
      this.handleError(error);
      throw error;
    }
  }

  /**
   * Simple chat interface
   */
  async chat(
    message: string,
    conversationHistory: MiniMaxMessage[] = []
  ): Promise<string> {
    const messages: MiniMaxMessage[] = [
      ...conversationHistory,
      { role: 'user', content: message }
    ];

    const response = await this.chatCompletion(messages);
    return response.choices[0]?.message?.content || '';
  }

  /**
   * Validate API key and connectivity
   */
  async validateConnection(): Promise<boolean> {
    try {
      await this.chatCompletion([
        { role: 'user', content: 'Hello' }
      ], { maxTokens: 10 });
      return true;
    } catch (error) {
      console.error('MiniMax API validation failed:', error);
      return false;
    }
  }

  /**
   * Get model information
   */
  getModelInfo(): {
    model: string;
    baseURL: string;
    temperature: number;
    maxTokens: number;
    timeout: number;
  } {
    return {
      model: this.model,
      baseURL: this.baseURL,
      temperature: this.temperature,
      maxTokens: this.maxTokens,
      timeout: this.timeout,
    };
  }

  /**
   * Update configuration
   */
  updateConfig(config: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    timeout?: number;
  }): void {
    if (config.model !== undefined) this.model = config.model;
    if (config.temperature !== undefined) this.temperature = config.temperature;
    if (config.maxTokens !== undefined) this.maxTokens = config.maxTokens;
    if (config.timeout !== undefined) {
      this.timeout = config.timeout;
      this.client.defaults.timeout = config.timeout;
    }
  }

  private handleError(error: any): void {
    let errorMessage = 'Unknown error occurred';

    if (error.response) {
      // API responded with error status
      const status = error.response.status;
      const data = error.response.data;

      switch (status) {
        case 400:
          errorMessage = 'Bad request - invalid parameters';
          break;
        case 401:
          errorMessage = 'Unauthorized - invalid API key';
          break;
        case 403:
          errorMessage = 'Forbidden - insufficient permissions';
          break;
        case 429:
          errorMessage = 'Rate limit exceeded';
          break;
        case 500:
          errorMessage = 'Internal server error';
          break;
        default:
          errorMessage = `API error (${status}): ${data?.error?.message || data?.message || 'Unknown error'}`;
      }

      this.emit('error', {
        type: 'api_error',
        status,
        message: errorMessage,
        data,
      });
    } else if (error.request) {
      // Network error
      errorMessage = 'Network error - unable to reach MiniMax API';
      this.emit('error', {
        type: 'network_error',
        message: errorMessage,
      });
    } else {
      // Other error
      errorMessage = error.message || 'Unknown error';
      this.emit('error', {
        type: 'unknown_error',
        message: errorMessage,
      });
    }

    console.error(`MiniMax API Error: ${errorMessage}`, error);
  }
}

/**
 * Factory function to create MiniMax adapter from environment variables
 */
export function createMiniMaxAdapter(): MiniMaxAdapter {
  const apiKey = process.env.MINIMAX_API_KEY;
  if (!apiKey) {
    throw new Error('MINIMAX_API_KEY environment variable is required');
  }

  return new MiniMaxAdapter({
    apiKey,
    baseURL: process.env.MINIMAX_BASE_URL,
    model: process.env.MINIMAX_MODEL,
    temperature: parseFloat(process.env.MINIMAX_TEMPERATURE || '0.7'),
    maxTokens: parseInt(process.env.MINIMAX_MAX_TOKENS || '4096'),
    timeout: parseInt(process.env.MINIMAX_TIMEOUT || '60000'),
  });
}

/**
 * Example usage
 */
export async function exampleMiniMaxUsage(): Promise<void> {
  try {
    const minimax = createMiniMaxAdapter();

    // Validate connection
    const isValid = await minimax.validateConnection();
    console.log('MiniMax API connection valid:', isValid);

    // Simple chat
    const response = await minimax.chat('Hello, how are you?');
    console.log('MiniMax response:', response);

    // Streaming chat
    console.log('Streaming response:');
    for await (const token of minimax.streamChatCompletion([
      { role: 'user', content: 'Tell me a joke' }
    ])) {
      process.stdout.write(token);
    }
    console.log('\n');

    // Listen to events
    minimax.on('token', (token) => {
      console.log('Received token:', token);
    });

    minimax.on('error', (error) => {
      console.error('MiniMax error:', error);
    });

  } catch (error) {
    console.error('MiniMax example failed:', error);
  }
}
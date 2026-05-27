import Anthropic from '@anthropic-ai/sdk';
import { executeTool, type ToolCall, type ToolResult, type ToolName } from './tools.js';

const client = new Anthropic();

export const TOOL_DEFINITIONS = [
  {
    name: 'set_light',
    description: 'Set a smart light device state and brightness',
    input_schema: {
      type: 'object',
      properties: {
        device: { type: 'string' },
        state: { type: 'string', enum: ['on', 'off'] },
        brightness: { type: 'number', minimum: 0, maximum: 100 },
      },
      required: ['device', 'state'],
    },
  },
  {
    name: 'set_thermostat',
    description: 'Set thermostat target temperature and mode',
    input_schema: {
      type: 'object',
      properties: {
        temp: { type: 'number' },
        mode: { type: 'string', enum: ['heat', 'cool', 'auto'] },
      },
      required: ['temp'],
    },
  },
  {
    name: 'lock_door',
    description: 'Lock or unlock a door',
    input_schema: {
      type: 'object',
      properties: {
        door: { type: 'string' },
        action: { type: 'string', enum: ['lock', 'unlock'] },
      },
      required: ['door', 'action'],
    },
  },
  {
    name: 'get_device_status',
    description: 'Get the current status of a smart device',
    input_schema: {
      type: 'object',
      properties: { device: { type: 'string' } },
      required: ['device'],
    },
  },
  {
    name: 'list_devices',
    description: 'List all smart home devices',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'check_calendar',
    description: 'Check calendar for events on a given date',
    input_schema: {
      type: 'object',
      properties: { date: { type: 'string' } },
      required: ['date'],
    },
  },
  {
    name: 'create_event',
    description: 'Create a calendar event',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        date: { type: 'string' },
        time: { type: 'string' },
        duration_minutes: { type: 'number' },
      },
      required: ['title', 'date', 'time'],
    },
  },
  {
    name: 'delete_event',
    description: 'Delete a calendar event by ID',
    input_schema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    },
  },
  {
    name: 'send_reminder',
    description: 'Send a reminder to a recipient',
    input_schema: {
      type: 'object',
      properties: {
        recipient: { type: 'string' },
        message: { type: 'string' },
        time: { type: 'string' },
      },
      required: ['recipient', 'message'],
    },
  },
  {
    name: 'list_events',
    description: 'List calendar events for a date range',
    input_schema: {
      type: 'object',
      properties: { date: { type: 'string' } },
      required: ['date'],
    },
  },
  {
    name: 'search_web',
    description: 'Search the web for information',
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
    },
  },
  {
    name: 'get_weather',
    description: 'Get current weather for a city',
    input_schema: {
      type: 'object',
      properties: { city: { type: 'string' } },
      required: ['city'],
    },
  },
  {
    name: 'get_news',
    description: 'Get recent news articles on a topic',
    input_schema: {
      type: 'object',
      properties: { topic: { type: 'string' } },
      required: ['topic'],
    },
  },
  {
    name: 'get_stock_price',
    description: 'Get current stock price for a ticker symbol',
    input_schema: {
      type: 'object',
      properties: { symbol: { type: 'string' } },
      required: ['symbol'],
    },
  },
  {
    name: 'summarize_text',
    description: 'Summarize a piece of text',
    input_schema: {
      type: 'object',
      properties: { text: { type: 'string' } },
      required: ['text'],
    },
  },
] as const;

export interface AgentRunResult {
  toolSequence: string[];
  toolResults: ToolResult[];
  totalInputTokens: number;
  totalOutputTokens: number;
  llmCalls: number;
  latencyMs: number;
}

export interface TurnHintContext {
  lastTool: string | null;
  turn: number;
}

export interface TurnHintResult {
  hint: string;
  predictedTool: string | null;
}

export interface AgentLoopOptions {
  systemPromptAddition?: string;
  getTurnHint?: (ctx: TurnHintContext) => Promise<TurnHintResult | string>;
  onToolExecuted?: (ctx: {
    lastTool: string;
    predictedTool: string | null;
  }) => void;
  maxToolCalls?: number;
}

export async function runAgentLoop(
  taskDescription: string,
  options: AgentLoopOptions | string = '',
): Promise<AgentRunResult> {
  const opts: AgentLoopOptions =
    typeof options === 'string' ? { systemPromptAddition: options } : options;

  const startTime = Date.now();
  const toolSequence: string[] = [];
  const toolResults: ToolResult[] = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let llmCalls = 0;
  let lastTool: string | null = null;
  const maxToolCalls = opts.maxToolCalls ?? 8;

  const baseSystemPrompt = [
    'You are a helpful AI agent. Complete the user task by calling the appropriate tools.',
    'Call only the tools necessary to complete the task — do not call tools unnecessarily.',
    'When the task is complete, do not call any more tools.',
    opts.systemPromptAddition,
  ]
    .filter(Boolean)
    .join('\n\n');

  const messages: Anthropic.Messages.MessageParam[] = [
    { role: 'user', content: taskDescription },
  ];

  while (toolSequence.length < maxToolCalls) {
    let turnHint = '';
    let predictedTool: string | null = null;

    if (opts.getTurnHint) {
      const hintResult = await opts.getTurnHint({ lastTool, turn: llmCalls });
      if (typeof hintResult === 'string') {
        turnHint = hintResult;
      } else {
        turnHint = hintResult.hint;
        predictedTool = hintResult.predictedTool;
      }
    }

    const systemPrompt = turnHint
      ? `${baseSystemPrompt}\n\nRouting hint: ${turnHint}`
      : baseSystemPrompt;

    llmCalls++;

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: systemPrompt,
      tools: TOOL_DEFINITIONS as unknown as Anthropic.Messages.Tool[],
      messages,
    });

    totalInputTokens += response.usage.input_tokens;
    totalOutputTokens += response.usage.output_tokens;

    const toolUseBlocks = response.content.filter(
      (block): block is Anthropic.Messages.ToolUseBlock => block.type === 'tool_use',
    );

    if (toolUseBlocks.length === 0 || response.stop_reason === 'end_turn') {
      break;
    }

    const toolResultContents: Anthropic.Messages.ToolResultBlockParam[] = [];
    for (const toolUse of toolUseBlocks) {
      const toolCall: ToolCall = {
        name: toolUse.name as ToolName,
        input: toolUse.input as Record<string, unknown>,
      };
      const result = executeTool(toolCall);
      toolSequence.push(toolUse.name);
      toolResults.push(result);
      totalInputTokens += result.tokens_used;
      lastTool = toolUse.name;

      if (opts.onToolExecuted) {
        opts.onToolExecuted({ lastTool: toolUse.name, predictedTool });
      }

      toolResultContents.push({
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: JSON.stringify(result.output),
      });
    }

    messages.push({ role: 'assistant', content: response.content });
    messages.push({ role: 'user', content: toolResultContents });
  }

  return {
    toolSequence,
    toolResults,
    totalInputTokens,
    totalOutputTokens,
    llmCalls,
    latencyMs: Date.now() - startTime,
  };
}

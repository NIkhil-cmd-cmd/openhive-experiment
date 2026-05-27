export type ToolName =
  | 'set_light'
  | 'set_thermostat'
  | 'lock_door'
  | 'get_device_status'
  | 'list_devices'
  | 'check_calendar'
  | 'create_event'
  | 'delete_event'
  | 'send_reminder'
  | 'list_events'
  | 'search_web'
  | 'get_weather'
  | 'get_news'
  | 'get_stock_price'
  | 'summarize_text';

export interface ToolCall {
  name: ToolName;
  input: Record<string, unknown>;
}

export interface ToolResult {
  name: ToolName;
  output: Record<string, unknown>;
  success: boolean;
  tokens_used: number;
}

export function executeTool(call: ToolCall): ToolResult {
  const mockOutputs: Record<ToolName, Record<string, unknown>> = {
    set_light: {
      device: call.input.device ?? 'living_room',
      state: call.input.state ?? 'on',
      brightness: call.input.brightness ?? 80,
    },
    set_thermostat: { target_temp: call.input.temp ?? 72, mode: 'heat', status: 'set' },
    lock_door: { door: call.input.door ?? 'front', state: 'locked' },
    get_device_status: {
      device: call.input.device,
      online: true,
      last_seen: new Date().toISOString(),
    },
    list_devices: {
      devices: ['living_room_light', 'thermostat', 'front_door_lock', 'bedroom_light'],
    },
    check_calendar: {
      events: [{ title: 'Team standup', time: '09:00', duration: 30 }],
    },
    create_event: {
      id: 'evt_' + Math.random().toString(36).slice(2),
      title: call.input.title,
      confirmed: true,
    },
    delete_event: { id: call.input.id, deleted: true },
    send_reminder: { recipient: call.input.recipient, sent: true },
    list_events: { events: [], date: call.input.date ?? 'today' },
    search_web: {
      results: [
        {
          title: 'Mock result',
          snippet: 'This is a mock search result for: ' + call.input.query,
          url: 'https://example.com',
        },
      ],
    },
    get_weather: {
      city: call.input.city ?? 'San Francisco',
      temp: 68,
      condition: 'partly cloudy',
      humidity: 72,
    },
    get_news: {
      articles: [{ headline: 'Mock headline for: ' + call.input.topic, source: 'Reuters' }],
    },
    get_stock_price: { symbol: call.input.symbol ?? 'AAPL', price: 189.45, change: +1.2 },
    summarize_text: {
      summary: 'Mock summary of provided text.',
      original_length: String(call.input.text ?? '').length,
    },
  };

  return {
    name: call.name,
    output: mockOutputs[call.name] ?? {},
    success: true,
    tokens_used: 80 + Math.floor(Math.random() * 40),
  };
}

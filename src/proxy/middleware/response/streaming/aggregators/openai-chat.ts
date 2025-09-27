import { OpenAIChatCompletionStreamEvent } from "../index";

export type OpenAiChatCompletionResponse = {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    message: { role: string; content: string };
    finish_reason: string | null;
    index: number;
  }[];
};

/**
 * Given a list of OpenAI chat completion events, compiles them into a single
 * finalized OpenAI chat completion response so that non-streaming middleware
 * can operate on it as if it were a blocking response.
 */
export function mergeEventsForOpenAIChat(
  events: OpenAIChatCompletionStreamEvent[]
): OpenAiChatCompletionResponse {
  return events.reduce<OpenAiChatCompletionResponse>(
    (acc, event) => {
      if (!event.choices || event.choices.length === 0) {
        return acc;
      }

      // Initialize with the first valid event
      if (!acc.id && event.id) {
        acc.id = event.id;
        acc.object = event.object || "chat.completion";
        acc.created = event.created;
        acc.model = event.model;
      }

      const choice = event.choices[0];
      if (choice.delta?.content) {
        acc.choices[0].message.content += choice.delta.content;
      }
      if (choice.delta?.role) {
        acc.choices[0].message.role = choice.delta.role;
      }
      if (choice.finish_reason) {
        acc.choices[0].finish_reason = choice.finish_reason;
      }

      return acc;
    },
    {
      id: "",
      object: "chat.completion",
      created: 0,
      model: "",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: "" },
          finish_reason: null,
        },
      ],
    }
  );
}

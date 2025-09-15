import Fastify from "fastify";
import fastifyWs from "@fastify/websocket";
import fastifyFormBody from '@fastify/formbody';
import OpenAI from "openai";
import dotenv from "dotenv";
import axios from "axios";
import twilio from "twilio";

dotenv.config();
const { TWILIO_ACCOUNT_SID } = process.env;
const { TWILIO_AUTH_TOKEN } = process.env;
const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

const PORT = process.env.PORT || 8080;
const DOMAIN = process.env.NGROK_URL;
const WS_URL = `wss://${DOMAIN}/ws`;
const WELCOME_GREETING =
  "Hi! I am a voice assistant powered by Twilio and Open A I . Ask me anything!";
const SYSTEM_PROMPT = `You are a helpful assistant. This conversation is being translated to voice, so answer carefully. 
When you respond, please spell out all numbers, for example twenty not 20. Do not include emojis in your responses. Do not include bullet points, asterisks, or special symbols.
You should use the 'get_programming_joke' function only when the user is asking for a programming joke (or a very close prompt, such as developer or software engineering joke). For other requests, including other types of jokes, you should use your own knowledge.
You should use the 'addHuman' function if the customer asks to talk to a real person or human agent or something similar.`;
const sessions = new Map();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function getJoke() {
  // Use jokeapi.dev to fetch a clean joke
  const response = await axios.get(
    "https://v2.jokeapi.dev/joke/Programming?safe-mode"
  );
  const data = response.data;
  return data.type === "single"
    ? data.joke
    : `${data.setup} ... ${data.delivery}`;
}

async function addHuman(wsConferenceName) {
  console.log("Adding human agent to the call");

  console.log("wsConferenceName:", wsConferenceName);
  
  const participant = await client
  .conferences(wsConferenceName)
  .participants.create({
      from: process.env.TWILIO_PHONE_NUMBER,
      label: "human agent",
      to: process.env.HUMAN_AGENT_NUMBER,
      earlyMedia: false,
  });

console.log('Humam Agent Participant Call SID:', participant.callSid);
}

async function aiResponseStream(conversation, ws, wsConferenceName) {
  const tools = [
    {
      type: "function",
      function: {
        name: "get_programming_joke",
        description: "Fetches a programming joke",
        parameters: {
          type: "object",
          properties: {},
          required: [],
          additionalProperties: false,
        },
        strict: true,
      },
    },
    {
      type: "function",
      function: {
        name: "addHuman",
        description: "Adds a human agent to the call with the user.",
        parameters: {
          type: "object",
          properties: {},
          required: [],
          additionalProperties: false,
        },
        strict: true,
      },
    },
  ];

  const stream = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: conversation,
    tools: tools,
    stream: true,
  });

  const assistantSegments = [];

  console.log("Received response chunks:");
  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content || "";
    const toolCalls = chunk.choices[0].delta.tool_calls || [];

    for (const toolCall of toolCalls) {
      if (toolCall.function.name === "get_programming_joke") {
        const joke = await getJoke();

        // Append tool call request and the result with the "tool" role
        conversation.push({
          role: "assistant",
          tool_calls: [
            {
              id: toolCall.id,
              function: {
                name: toolCall.function.name,
                arguments: "{}",
              },
              type: "function",
            },
          ],
        });

        conversation.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: joke,
        });

        // Send the final "last" token when streaming completes
        ws.send(JSON.stringify({ type: "text", token: joke, last: true }));
        assistantSegments.push(joke);
        console.log("Fetched joke:", joke);
      }
      if (toolCall.function.name === "addHuman") {
        await addHuman(wsConferenceName);

        // Append tool call request and the result with the "tool" role
        conversation.push({
          role: "assistant",
          tool_calls: [
            {
              id: toolCall.id,
              function: {
                name: toolCall.function.name,
                arguments: "{}",
              },
              type: "function",
            },
          ],
        });

        conversation.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: "Added human",
        });

        // Send the final "last" token when streaming completes
        //ws.send(JSON.stringify({ type: "text", token: "Added human", last: true }));
        //assistantSegments.push("Added human");
        console.log("Added human agent");
      }
    }

    console.log("Chunk:", content);
    ws.send(
      JSON.stringify({
        type: "text",
        token: content,
        last: false,
      })
    );

    assistantSegments.push(content);
  }

  ws.send(
    JSON.stringify({
      type: "text",
      token: "",
      last: true,
    })
  );
  console.log("Assistant response complete.");

  const sessionData = sessions.get(ws.callSid);
  sessionData.conversation.push({
    role: "assistant",
    content: assistantSegments.join(""),
  });
  console.log(
    "Final accumulated response:",
    JSON.stringify(assistantSegments.join(""))
  );
}

const fastify = Fastify();
fastify.register(fastifyWs);
fastify.register(fastifyFormBody);
fastify.all("/twiml", async (request, reply) => {


  const conferenceName = `${request.body.CallSid}`;

  async function createParticipant() {
      const participant = await client
          .conferences(conferenceName)
          .participants.create({
              from: request.body.From, // Use the from number from the call
              label: "virtual agent",
              to: `app:${process.env.TWIML_APP}?conferenceName=${conferenceName}`,
              earlyMedia: false,
              callToken: request.body.CallToken,
              conferenceStatusCallback: `https://${DOMAIN}/conference-events`,
              conferenceStatusCallbackEvent: 'join'
          });

      console.log('Virtual Agent Participant Call SID:', participant.callSid);
      return participant;

      
      }


 const participant = await createParticipant();

const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
                    <Response>
                        <Dial>
                            <Conference 
                                startConferenceOnEnter="true"
                                participantLabel="customer"
                                endConferenceOnExit="true"
                            >
                                ${conferenceName}
                            </Conference>
                        </Dial>
                    </Response>`;
reply.type('text/xml').send(twimlResponse);

/*

  reply.type("text/xml").send(
    `<?xml version="1.0" encoding="UTF-8"?>
    <Response>
      <Connect>
        <ConversationRelay url="${WS_URL}" welcomeGreeting="${WELCOME_GREETING}" />
      </Connect>
    </Response>`
  );*/
});

fastify.all('/incoming-virtual-agent-number', async (request, reply) => {

  const FromNumber = request.body.From;
  const conferenceName = request.body.conferenceName;

  const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
                        <Response>
                            <Connect>
                                <ConversationRelay url="${WS_URL}" welcomeGreeting="${WELCOME_GREETING}" >
                                    <Parameter name="conferenceName" value="${conferenceName}" />
                                </ConversationRelay>
                            </Connect>
                        </Response>`;
  reply.type('text/xml').send(twimlResponse);
});

fastify.all('/conference-events', async (request, reply) => {

  if (request.body.ParticipantLabel === 'human agent' && request.body.StatusCallbackEvent === 'participant-join') {
      console.log('Human Agent joined the conference:', request.body.ConferenceSid);
      
      async function findVirtualAgentandDisconnect() {
          const participants = await client
            .conferences(request.body.ConferenceSid)
            .participants.list({
              limit: 20,
            });
        
          for (const participant of participants) {
              if (participant.label === 'virtual agent') {
                  console.log('Virtual Agent Call SID:', participant.callSid);

                  // End the virtual agent call
                  await client.calls(participant.callSid).update({ status: 'completed' });
                  console.log('Virtual agent call ended.');
              }
          }
        }
        console.log('Getting participants for conference:', request.body.ConferenceSid);

      await  findVirtualAgentandDisconnect();
      
  }
});

fastify.register(async function (fastify) {
  fastify.get("/ws", { websocket: true }, (ws, req) => {

    let wsConferenceName = null;

    ws.on("message", async (data) => {
      const message = JSON.parse(data);

      switch (message.type) {
        case "setup":
          wsConferenceName = message.customParameters?.conferenceName || null;
          console.log('Media Stream Conference SID:', wsConferenceName);

          const callSid = message.callSid;
          console.log("Setup for call:", callSid);
          ws.callSid = callSid;
          sessions.set(callSid, {
            conversation: [{ role: "system", content: SYSTEM_PROMPT }],
            lastFullResponse: [],
          });
          break;
        case "prompt":
          console.log("Processing prompt:", message.voicePrompt);
          const sessionData = sessions.get(ws.callSid);
          sessionData.conversation.push({
            role: "user",
            content: message.voicePrompt,
          });

          aiResponseStream(sessionData.conversation, ws, wsConferenceName);
          break;
        case "interrupt":
          console.log(
            "Handling interruption; last utterance: ",
            message.utteranceUntilInterrupt
          );
          handleInterrupt(ws.callSid, message.utteranceUntilInterrupt);
          break;
        default:
          console.warn("Unknown message type received:", message.type);
          break;
      }
    });

    ws.on("close", () => {
      console.log("WebSocket connection closed");
      sessions.delete(ws.callSid);
    });
  });
});

function handleInterrupt(callSid, utteranceUntilInterrupt) {
  const sessionData = sessions.get(callSid);
  const conversation = sessionData.conversation;

  let updatedConversation = [...conversation];

  const interruptedIndex = updatedConversation.findIndex(
    (message) =>
      message.role === "assistant" &&
      message.content &&
      message.content.includes(utteranceUntilInterrupt)
  );

  if (interruptedIndex !== -1) {
    const interruptedMessage = updatedConversation[interruptedIndex];

    const interruptPosition = interruptedMessage.content.indexOf(
      utteranceUntilInterrupt
    );
    const truncatedContent = interruptedMessage.content.substring(
      0,
      interruptPosition + utteranceUntilInterrupt.length
    );

    updatedConversation[interruptedIndex] = {
      ...interruptedMessage,
      content: truncatedContent,
    };

    updatedConversation = updatedConversation.filter(
      (message, index) =>
        !(index > interruptedIndex && message.role === "assistant")
    );
  }

  sessionData.conversation = updatedConversation;
  sessions.set(callSid, sessionData);
}

try {
  fastify.listen({ port: PORT });
  console.log(
    `Server running at http://localhost:${PORT} and wss://${DOMAIN}/ws`
  );
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}

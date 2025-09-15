# Voice Assistant with Twilio and Open AI (Node.js)

This application demonstrates how to use Node.js, [Twilio Voice](https://www.twilio.com/docs/voice) and [ConversationRelay](https://www.twilio.com/docs/voice/twiml/connect/conversationrelay), and the [Open AI API](https://docs.anthropic.com) to create a voice assistant that can engage in two-way conversations over a phone call.

Other branches in this repository demonstrate how to add more advanced features such as [streaming](https://github.com/robinske/cr-demo/tree/feature/step2-streaming-tokens), [interruption handling](https://github.com/robinske/cr-demo/tree/feature/step3-conversation-tracking), and [tool/function calling](https://github.com/robinske/cr-demo/tree/feature/step4-tool-calling).

> [!NOTE]
> Looking for a step by step tutorial? Find an [interative build guide for OpenAI and Twilio Voice here](https://github.com/robinske/forge-build-tutorial).

## Prerequisites

To use the app, you will need:

- **Node.js 23.9.0**: Download from [here](https://nodejs.org/). Other versions may work, but I tested with this one.
- **A Twilio Account**: Sign up for a free trial [here](https://www.twilio.com/try-twilio).
- **A Twilio Number with Voice Capabilities**: [Instructions to purchase a number](https://help.twilio.com/articles/223135247-How-to-Search-for-and-Buy-a-Twilio-Phone-Number-from-Console).
- **An Open AI Account and API Key**: Visit Open AI's platform [here](https://platform.openai.com/api-keys) for more information.

## Setup

### 1. Run ngrok

You'll need to expose your local server to the internet for Twilio to access it. Use ngrok for tunneling:

```bash
ngrok http 8080
```

Copy the Forwarding URL and put it aside; it looks like https://[your-ngrok-subdomain].ngrok.app. You'll need it in a couple places.

### 2. Install dependencies

Run the following command to install necessary packages:

```bash
npm install
```

### 3. Configure Twilio

Update Your Twilio Phone Number: In the Twilio Console under **Phone Numbers**, set the Webhook for **A call comes in** to your ngrok URL followed by /twiml. 

Example: `https://[your-ngrok-subdomain].ngrok.app/twiml`.

### 4. Configure Environment Variables

Copy the example environment file to `.env`:

```bash
cp .env.example .env
```

Edit the .env file and input your Open AI API key in `OPENAI_API_KEY`. Add your ngrok URL in `NGROK_URL` (do not include the scheme, "http://" or "https://")

## Run the app

Start the development server:

```bash
node server.js
```

## Run and test the app

Call your Twilio phone number. After connection, you should be able to converse with the Open AI-powered AI Assistant, integrated over ConversationRelay with Twilio Voice!

> [!NOTE] 
> Customize the initial greeting and response behavior by modifying the aiResponse function and constants like SYSTEM_PROMPT in index.js.
> Ensure that you update ngrok URLs each time you restart ngrok, as they change with each session.

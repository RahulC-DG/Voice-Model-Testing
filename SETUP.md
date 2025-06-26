# Environment Setup

Create a `.env` file in the root directory with the following variables:

```
# STT API Keys for Multi-Model Comparison
DEEPGRAM_API_KEY=your_deepgram_api_key_here
ASSEMBLYAI_API_KEY=your_assemblyai_api_key_here
CARTESIA_API_KEY=sk_car_HA86apjxmS9Ww2CWWv3uKK
```

Replace the placeholder values with your actual API keys.

## Running the Application

1. Install dependencies: `npm install`
2. Create `.env` file with your API keys
3. Start the server: `npm start`
4. Open http://localhost:3001 in your browser

## Features

- **Triple STT Comparison**: Deepgram Nova-3 + AssemblyAI Universal v3 + Cartesia Ink-Whisper
- **Model Selection**: Choose between AssemblyAI and Cartesia for comparison
- **Real-time Streaming**: All models process audio simultaneously
- **Performance Metrics**: First response time and word count tracking

## Usage

1. **Select Comparison Model**: Use the dropdown to choose between AssemblyAI and Cartesia
2. **Start Recording**: Click the microphone button to begin real-time transcription
3. **View Results**: See side-by-side transcription results from Deepgram and your selected model
4. **Monitor Performance**: Track word counts and first response times for each service

## API Keys Required

- **Deepgram**: Get your API key from https://console.deepgram.com/
- **AssemblyAI**: Get your API key from https://www.assemblyai.com/dashboard/
- **Cartesia**: Get your API key from https://play.cartesia.ai/

## Troubleshooting

- Ensure all API keys are valid and have sufficient credits
- Check browser console for WebSocket connection errors
- Verify microphone permissions are granted
- Make sure server is running on port 3001 
# Multi-Model Speech-to-Text Comparison Tool

A real-time speech-to-text comparison application that simultaneously transcribes audio using multiple AI models, allowing you to compare speed, accuracy, and formatting differences in real-time.

**Built upon the Deepgram Live Transcription Starter** and expanded to support multiple STT services for comprehensive comparison analysis.

## 🎯 Features

### Real-Time Transcription
- **Live Audio Processing**: Capture audio from your microphone and get real-time transcriptions
- **Multi-Model Comparison**: Compare up to 7 different STT services simultaneously:
  - **Deepgram Nova-3** (Primary baseline)
  - **AssemblyAI Universal Streaming v3**
  - **Cartesia Ink-Whisper**
  - **Speechmatics Real-Time**
  - **Google Cloud Speech-to-Text**
  - **OpenAI Whisper Real-time**
  - **Microsoft Azure Speech-to-Text**

### File Processing
- **Batch Audio Processing**: Upload and process audio/video files
- **Multiple Format Support**: MP3, WAV, MP4, MOV, AVI, and more
- **Reference Transcript Comparison**: Calculate Word Error Rate (WER) against known transcripts
- **Built-in Test Scripts**: Pre-loaded test transcripts for standardized evaluation

### Performance Analytics (to be unbaised we are using simple metrics and letting the visuals speak for themselves)
- **Real-Time Statistics**: Word counts, first response times, and recording duration
- **WER Analysis**: Automatic Word Error Rate calculation for accuracy comparison
- **Response Time Tracking**: Measure and compare latency across services

## 🚀 Getting Started

### Prerequisites
- Node.js (v14 or higher)
- API keys for the STT services you want to use

### Installation

1. **Clone the repository**
   ```bash
   git clone <your-repository-url>
   cd js-live-example
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   Create a `.env` file in the root directory:
   ```env
   DEEPGRAM_API_KEY=your_deepgram_api_key
   ASSEMBLYAI_API_KEY=your_assemblyai_api_key
   CARTESIA_API_KEY=your_cartesia_api_key
   SPEECHMATICS_API_KEY=your_speechmatics_api_key
   GOOGLE_API_KEY=your_google_cloud_api_key
   OPENAI_API_KEY=your_openai_api_key
   MICROSOFT_API_KEY=your_microsoft_api_key
   MICROSOFT_SPEECH_ENDPOINT=https://your-region.api.cognitive.microsoft.com/
   ```

4. **Start the server**
   ```bash
   npm start
   ```

5. **Open your browser**
   Navigate to `http://localhost:3001`

## 📋 API Keys Setup

### Deepgram
1. Sign up at [Deepgram Console](https://console.deepgram.com/)
2. Create a new API key
3. Add to `.env` as `DEEPGRAM_API_KEY`

### AssemblyAI
1. Sign up at [AssemblyAI Dashboard](https://www.assemblyai.com/dashboard/)
2. Copy your API key
3. Add to `.env` as `ASSEMBLYAI_API_KEY`

### Cartesia
1. Sign up at [Cartesia Console](https://play.cartesia.ai/)
2. Generate an API key
3. Add to `.env` as `CARTESIA_API_KEY`

### Speechmatics
1. Sign up at [Speechmatics Portal](https://portal.speechmatics.com/)
2. Create an API key
3. Add to `.env` as `SPEECHMATICS_API_KEY`

### Google Cloud Speech
1. Set up a [Google Cloud Project](https://console.cloud.google.com/)
2. Enable the Speech-to-Text API
3. Create an API key (not service account)
4. Add to `.env` as `GOOGLE_API_KEY`

### OpenAI Whisper
1. Sign up at [OpenAI Platform](https://platform.openai.com/)
2. Create an API key
3. Add to `.env` as `OPENAI_API_KEY`

### Microsoft Azure Speech
1. Create an [Azure Cognitive Services](https://azure.microsoft.com/en-us/services/cognitive-services/) resource
2. Get your API key and endpoint from the Azure portal
3. Add to `.env` as `MICROSOFT_API_KEY` and `MICROSOFT_SPEECH_ENDPOINT`



## 🎮 Usage

### Live Recording Mode
1. **Select Comparison Model**: Choose which STT service to compare against Deepgram
2. **Click the Microphone**: Start recording and see real-time transcriptions
3. **Monitor Performance**: Watch word counts, response times, and accuracy in real-time
4. **Stop Recording**: Click the microphone again to stop and finalize transcripts

### File Processing Mode
1. **Upload Files**: Drag & drop or browse for audio/video files
2. **Set Reference Transcript** (Optional): Paste expected transcript for WER calculation
3. **Process Files**: Click "Process Files" to transcribe with all available models
4. **Review Results**: Compare transcriptions and WER scores

## 🏗️ Architecture

### Backend (`server.js`)
- **Express.js** server with WebSocket support
- **Multi-service integration** with proper error handling
- **Audio format conversion** using FFmpeg for file processing
- **Real-time audio streaming** to multiple STT services simultaneously

### Frontend (`client.js`)
- **Web Audio API** for microphone capture
- **Real-time WebSocket** communication
- **Dynamic UI updates** for different comparison models
- **Performance metrics** tracking and display

### Audio Processing
- **PCM16 format** at 16kHz sample rate for optimal compatibility
- **Real-time conversion** from Float32 to Int16 for browser audio
- **Base64 encoding** for WebSocket transmission

## 📊 Comparison Models

| Service | Model | Features | Best For |
|---------|-------|----------|----------|
| **Deepgram** | Nova-3 | Smart formatting, fast response | Baseline comparison |
| **AssemblyAI** | Universal v3 | Turn-based transcription | Conversation analysis |
| **Cartesia** | Ink-Whisper | Low latency, streaming | Real-time applications |
| **Speechmatics** | Enhanced | Speaker diarization | Multi-speaker scenarios |
| **Google** | Cloud Speech | Punctuation, confidence scores | Enterprise integration |
| **OpenAI** | Whisper Real-time | Advanced language understanding | Complex audio processing |
| **Microsoft** | Azure Speech | Enterprise features, customization | Business applications |

## 🔧 Technical Details

### Audio Configuration
- **Sample Rate**: 24kHz (optimized for OpenAI Whisper, downsampled for other services)
- **Encoding**: PCM 16-bit signed little-endian
- **Channels**: Mono (1 channel)
- **Buffer Size**: 4096 samples

### WebSocket Protocol
- **Connection**: Single WebSocket handles all STT services
- **Message Types**: `start`, `audio`, `stop`
- **Response Types**: `status`, `transcript`, `error`

### Performance Optimizations
- **Parallel Processing**: All STT services process audio simultaneously
- **Efficient Buffering**: Optimized audio chunk sizes for each service
- **Connection Pooling**: Reusable WebSocket connections

## 🛠️ Development

### Project Structure
```
├── server.js              # Main server with multi-STT integration
├── public/
│   ├── index.html         # Main UI with mode switching
│   ├── client.js          # Frontend logic and WebSocket handling
│   └── style.css          # Responsive styling
├── package.json           # Dependencies and scripts
└── .env                   # API keys (create this)
```

### Adding New STT Services
1. **Install SDK**: Add the service's JavaScript SDK
2. **Update server.js**: Add connection logic and message handlers
3. **Update client.js**: Add UI handling for the new service
4. **Update HTML**: Add service to dropdown selector

## 📈 Performance Metrics

### Measured Metrics
- **First Response Time**: Time from audio start to first transcript
- **Word Count**: Real-time word counting per service
- **Word Error Rate**: Accuracy measurement against reference transcripts
- **Latency**: End-to-end transcription delay

### WER Calculation
Uses Levenshtein distance algorithm to calculate:
```
WER = (Substitutions + Deletions + Insertions) / Total Reference Words × 100%
```

## 🐛 Troubleshooting

### Common Issues

**Microphone Access Denied**
- Ensure HTTPS or localhost for microphone permissions
- Check browser microphone settings

**WebSocket Connection Failed**
- Verify server is running on port 3001
- Check firewall settings

**API Key Errors**
- Verify all API keys are correctly set in `.env`
- Check API key permissions and quotas

**Audio Quality Issues**
- Ensure quiet environment for best results
- Check microphone quality and positioning

## 📝 License

This project builds upon the Deepgram Live Transcription Starter and is available under the MIT License.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test with multiple STT services
5. Submit a pull request

## 🙏 Acknowledgments

- **Deepgram** for the original live transcription starter
- **AssemblyAI** for Universal Streaming v3 API
- **Cartesia** for Ink-Whisper real-time STT
- **Speechmatics** for enhanced real-time transcription
- **Google Cloud** for Speech-to-Text API
- **OpenAI** for Whisper real-time transcription
- **Microsoft** for Azure Speech-to-Text services

---

**Built for developers, researchers, and anyone interested in comparing speech-to-text accuracy and performance across 7 major AI models in real-time.**

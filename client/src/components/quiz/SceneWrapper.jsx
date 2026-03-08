import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import FlashcardUploader from './FlashcardUploader';
import { createQuizScene, createQuizConversationConfig } from '../../sceneConfig';
import { API_CONFIG } from '../../config';
import { getDefaultVoiceByGender } from '../avatarconfig/utils/AvatarHandler';

const SceneWrapper = ({ onExitQuiz }) => {
  // Setup state
  const [flashcards, setFlashcards] = useState([]);
  const [topic, setTopic] = useState('General Knowledge');
  const [examinerName, setExaminerName] = useState('Alice');
  const [maxTurns, setMaxTurns] = useState(50);
  const [isSetup, setIsSetup] = useState(true);

  // Conversation state
  const [messages, setMessages] = useState([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [waitingForInput, setWaitingForInput] = useState(false);
  const [humanInput, setHumanInput] = useState('');
  const [currentSpeaker, setCurrentSpeaker] = useState(null);
  const [conversationComplete, setConversationComplete] = useState(false);
  const [error, setError] = useState('');
  const [avatarStatus, setAvatarStatus] = useState('idle'); // idle | loading | ready | error
  const [avatarError, setAvatarError] = useState(null);

  // Refs
  const avatarInstancesRef = useRef({});
  const webcamStreamRef = useRef(null);
  const webcamVideoRef = useRef(null);
  const sceneContainerRef = useRef(null);
  const messagesEndRef = useRef(null);
  const abortControllerRef = useRef(null);
  const inputRef = useRef(null);

  // Score tracking
  const [score, setScore] = useState({ correct: 0, incorrect: 0, total: 0 });

  // Memoize the scene so it doesn't get recreated on every render
  const scene = useMemo(() => createQuizScene({
    examinerName,
    studentName: 'You',
    topic,
  }), [examinerName, topic]);

  // Scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when waiting for human input
  useEffect(() => {
    if (waitingForInput && inputRef.current) {
      inputRef.current.focus();
    }
  }, [waitingForInput]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      // Stop all avatar instances
      Object.values(avatarInstancesRef.current).forEach(instance => {
        if (instance && typeof instance.stop === 'function') {
          try { instance.stop(); } catch (e) { /* ignore */ }
        }
      });
      // Stop webcam stream
      if (webcamStreamRef.current) {
        webcamStreamRef.current.getTracks().forEach(track => track.stop());
        webcamStreamRef.current = null;
      }
    };
  }, []);

  const initializeAvatar = async (containerId, avatarConfig) => {
    if (!containerId || !avatarConfig) {
      console.warn('[SceneWrapper] initializeAvatar: missing containerId or avatarConfig');
      return null;
    }
    if (avatarInstancesRef.current[containerId] && !avatarInstancesRef.current[containerId]._isStopped) {
      return avatarInstancesRef.current[containerId];
    }

    const avatarUrl = avatarConfig.url || avatarConfig.settings?.url || '/assets/avatar1.glb';
    setAvatarStatus('loading');
    setAvatarError(null);

    // Find the container directly in the DOM (same approach as ExperienceMode)
    const containerElement = document.getElementById(`avatar-container-${containerId}`);
    if (!containerElement) {
      const errMsg = `Container element not found: avatar-container-${containerId}`;
      console.error('[SceneWrapper]', errMsg);
      setAvatarStatus('error');
      setAvatarError(errMsg);
      return null;
    }

    // Clean up existing instance if stopped
    if (avatarInstancesRef.current[containerId]) {
      try { await avatarInstancesRef.current[containerId].stop(); } catch (e) { /* ignore */ }
      delete avatarInstancesRef.current[containerId];
      while (containerElement.firstChild) containerElement.removeChild(containerElement.firstChild);
    }

    try {
      // Ensure proper container styling
      containerElement.style.position = 'relative';
      containerElement.style.overflow = 'hidden';
      containerElement.style.display = 'block';

      // Force explicit pixel dimensions so Three.js gets a non-zero canvas size.
      // clientWidth/Height can be 0 if percentage-based layout hasn't fully resolved.
      let boxWidth = containerElement.clientWidth;
      let boxHeight = containerElement.clientHeight;

      if (!boxWidth || !boxHeight) {
        // Walk up the tree to find first ancestor with real dimensions
        let ancestor = containerElement.parentElement;
        while (ancestor && (!ancestor.clientWidth || !ancestor.clientHeight)) {
          ancestor = ancestor.parentElement;
        }
        const ancestorW = ancestor?.clientWidth || window.innerWidth;
        const ancestorH = ancestor?.clientHeight || window.innerHeight;
        // Approximate the avatar box: 40% wide, 80% tall of the 60% scene pane
        boxWidth = boxWidth || Math.round(ancestorW * 0.40);
        boxHeight = boxHeight || Math.round(ancestorH * 0.80);
      }

      // Apply pixel dimensions explicitly so TalkingHead/Three.js sees them
      containerElement.style.width = `${boxWidth}px`;
      containerElement.style.height = `${boxHeight}px`;

      console.log('[SceneWrapper] Container dimensions (px):', boxWidth, boxHeight);

      // Import TalkingHead directly (same as ExperienceMode)
      const TalkingHeadModule = await import('talkinghead');
      const { TalkingHead } = TalkingHeadModule;
      if (!TalkingHead) {
        throw new Error('TalkingHead not found in imported module');
      }
      console.log('[SceneWrapper] TalkingHead library imported successfully');

      const instance = new TalkingHead(containerElement, {
        height: boxHeight,
        ttsEndpoint: `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.TTS}`,
        ttsApikey: localStorage.getItem('TTS_API_KEY') || null,
        lipsyncModules: ['en'],
      });
      instance._isStopped = false;

      const originalStop = instance.stop;
      instance.stop = async function () {
        const result = await originalStop.apply(this, arguments);
        this._isStopped = true;
        return result;
      };

      // Add speakText compatibility if missing
      if (!instance.speakText && instance.speak) {
        instance.speakText = function (text) {
          return this.speak({ text, emotionType: 'neutral' });
        };
      }

      // Add playAudio compatibility if missing
      if (!instance.playAudio && instance.speak) {
        instance.playAudio = function (options) {
          return this.speak({
            text: options.text || '',
            audioBase64: options.url,
            emotionType: options.emotion || 'neutral',
          });
        };
      }

      const isMale =
        avatarConfig.gender === 'male' ||
        (avatarConfig.gender === undefined && avatarUrl.includes('male-avatar'));

      console.log('[SceneWrapper] Loading avatar model:', avatarUrl);
      await instance.showAvatar({
        id: avatarConfig.name,
        name: avatarConfig.name,
        url: avatarUrl,
        body: isMale ? 'M' : 'F',
        avatarMood: avatarConfig.settings?.mood || 'neutral',
        ttsLang: avatarConfig.settings?.ttsLang || 'en-GB',
        ttsVoice: avatarConfig.voice || getDefaultVoiceByGender({ gender: avatarConfig.gender, voice: avatarConfig.voice }),
        lipsyncLang: avatarConfig.settings?.lipsyncLang || 'en',
        transparent: true,
      });

      await instance.setView(avatarConfig.settings?.cameraView || 'upper', {
        cameraDistance: avatarConfig.settings?.cameraDistance || 0.5,
        cameraRotateY: avatarConfig.settings?.cameraRotateY || 0,
      });

      // After TalkingHead appends its canvas, switch the container back to responsive sizing
      // so it fills the flex/absolute parent correctly.
      containerElement.style.width = '100%';
      containerElement.style.height = '100%';

      // Ensure canvas elements are properly styled
      const canvasElements = containerElement.querySelectorAll('canvas');
      canvasElements.forEach((canvas) => {
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        canvas.style.display = 'block';
        canvas.style.imageRendering = 'auto';
      });

      // Store by element ID and by name for speaker lookup
      avatarInstancesRef.current[containerId] = instance;
      if (avatarConfig.name) {
        avatarInstancesRef.current[avatarConfig.name] = instance;
      }

      console.log('[SceneWrapper] Avatar initialized successfully for:', containerId);
      setAvatarStatus('ready');
      return instance;
    } catch (err) {
      console.error('[SceneWrapper] Error initializing avatar:', err);
      setAvatarStatus('error');
      setAvatarError(err.message || 'Unknown error initializing avatar');
      return null;
    }
  };

  const initializeWebcam = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      webcamStreamRef.current = stream;

      // Attach stream to the video element
      if (webcamVideoRef.current) {
        webcamVideoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error('Error accessing webcam:', err);
      setError('Could not access camera/microphone. Please check permissions.');
    }
  };

  const initializeScene = useCallback(async () => {
    // Initialize avatars
    for (const box of scene.boxes) {
      if (box.elements) {
        for (const element of box.elements) {
          if (element.elementType === 'avatar' && element.avatarData) {
            await initializeAvatar(element.id, element.avatarData);
          }
        }
      }
    }
    // Initialize webcam
    await initializeWebcam();
  }, [scene.boxes]);

  // Initialize scene after entering the quiz — use rAF to guarantee browser has painted
  useEffect(() => {
    if (!isSetup) {
      const timer = setTimeout(() => {
        requestAnimationFrame(async () => {
          await initializeScene();
          // Start conversation only after avatar is initialized
          startConversation();
        });
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [isSetup, initializeScene]);

  const startQuiz = async () => {
    if (flashcards.length === 0) {
      setError('Please add at least one flashcard before starting the quiz.');
      return;
    }

    setError('');
    setIsSetup(false);
    setMessages([]);
    setConversationComplete(false);
    setScore({ correct: 0, incorrect: 0, total: 0 });
    setAvatarStatus('idle');
    setAvatarError(null);
  };

  const startConversation = async () => {
    const config = createQuizConversationConfig(scene, flashcards, {
      maxTurns,
      examinerName,
      studentName: 'You',
    });

    setIsPlaying(true);
    abortControllerRef.current = new AbortController();

    try {
      const provider = localStorage.getItem('LLM_PROVIDER') || 'gemini';
      const key = provider === 'openai'
        ? localStorage.getItem('OPENAI_API_KEY')
        : localStorage.getItem('GEMINI_API_KEY');

      if (!key) {
        throw new Error(`No API key found for provider "${provider}". Please set your key in the Keys modal.`);
      }

      const response = await fetch(
        `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.START_CONVERSATION}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-llm-provider': provider,
            'x-llm-key': key,
          },
          body: JSON.stringify(config),
          signal: abortControllerRef.current.signal,
        }
      );

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}: ${response.statusText}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(line => line.trim());

        for (const line of lines) {
          try {
            const data = JSON.parse(line);

            if (data.type === 'message' && data.message) {
              const msg = data.message;
              setMessages(prev => [...prev, {
                sender: msg.sender,
                text: msg.message,
                timestamp: new Date().toISOString(),
                isHuman: false,
              }]);
              setCurrentSpeaker(msg.sender);

              // Make avatar speak (use ref to get latest instance)
              const avatar = avatarInstancesRef.current[msg.sender];
              if (avatar && typeof avatar.speakText === 'function') {
                try {
                  avatar.speakText(msg.message || '');
                } catch (e) {
                  console.error('Error making avatar speak:', e);
                }
              }
            } else if (data.type === 'human_input_required') {
              setWaitingForInput(true);
              setCurrentSpeaker(data.speaker);
            } else if (data.type === 'completion') {
              setConversationComplete(true);
              setIsPlaying(false);
            }
          } catch (e) {
            console.error('Error parsing message:', e);
          }
        }
      }

      setIsPlaying(false);
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('Error in conversation:', err);
        setError(`Conversation error: ${err.message}`);
      }
      setIsPlaying(false);
    }
  };

  const submitHumanInput = async () => {
    if (!humanInput.trim()) return;

    const inputText = humanInput.trim();
    setHumanInput('');
    setWaitingForInput(false);

    // Add user message to chat
    setMessages(prev => [...prev, {
      sender: 'You',
      text: inputText,
      timestamp: new Date().toISOString(),
      isHuman: true,
    }]);

    // Send to server
    try {
      await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.HUMAN_INPUT}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: inputText, speaker: 'You' }),
      });
    } catch (err) {
      console.error('Error sending human input:', err);
      setError('Failed to send your response. Please try again.');
      setWaitingForInput(true);
    }
  };

  const stopQuiz = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsPlaying(false);
    setWaitingForInput(false);
    setConversationComplete(true);
    // Stop webcam
    if (webcamStreamRef.current) {
      webcamStreamRef.current.getTracks().forEach(track => track.stop());
      webcamStreamRef.current = null;
    }
  };

  const resetQuiz = () => {
    stopQuiz();
    // Stop avatar instances
    Object.values(avatarInstancesRef.current).forEach(instance => {
      if (instance && typeof instance.stop === 'function') {
        try { instance.stop(); } catch (e) { /* ignore */ }
      }
    });
    avatarInstancesRef.current = {};
    setIsSetup(true);
    setMessages([]);
    setConversationComplete(false);
    setError('');
    setScore({ correct: 0, incorrect: 0, total: 0 });
  };

  // --- RENDER ---

  if (isSetup) {
    return (
      <div className="w-full h-screen bg-gray-900 text-gray-200 flex flex-col">
        {/* Header */}
        <header className="h-12 bg-gray-800 border-b border-gray-700 flex items-center px-4 shrink-0">
          <span className="text-lg font-bold text-white">DialogLab</span>
          <span className="text-gray-500 mx-2">|</span>
          <span className="text-sm text-blue-400">Quiz Mode</span>
          {onExitQuiz && (
            <button
              className="ml-auto px-3 py-1 text-sm bg-gray-700 text-gray-300 rounded hover:bg-gray-600 transition-colors"
              onClick={onExitQuiz}
            >
              Back to Authoring
            </button>
          )}
        </header>

        {/* Setup panel */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-3xl mx-auto">
            <h1 className="text-2xl font-bold mb-2">Quiz Setup</h1>
            <p className="text-gray-400 mb-6">
              Configure your quiz session. Upload flashcards and the examiner will quiz you on them.
            </p>

            {error && (
              <div className="mb-4 p-3 bg-red-900 bg-opacity-30 border border-red-700 rounded text-red-300 text-sm">
                {error}
              </div>
            )}

            {/* Quiz settings */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Topic</label>
                <input
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded border border-gray-600 bg-gray-800 text-gray-200 focus:border-blue-500 focus:outline-none"
                  placeholder="e.g., Biology 101, Job Interview..."
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Examiner Name</label>
                <select
                  value={examinerName}
                  onChange={(e) => setExaminerName(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded border border-gray-600 bg-gray-800 text-gray-200 focus:border-blue-500 focus:outline-none"
                >
                  <option value="Alice">Alice</option>
                  <option value="Grace">Grace</option>
                  <option value="Bob">Bob</option>
                  <option value="David">David</option>
                  <option value="Henry">Henry</option>
                </select>
              </div>
            </div>

            {/* Flashcards */}
            <div className="mb-6">
              <h2 className="text-lg font-semibold mb-2">Flashcards</h2>
              <FlashcardUploader
                flashcards={flashcards}
                onFlashcardsChange={setFlashcards}
              />
            </div>

            {/* Start button */}
            <div className="flex justify-center">
              <button
                className="px-8 py-3 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition-colors text-lg disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={startQuiz}
                disabled={flashcards.length === 0}
              >
                Start Quiz ({flashcards.length} card{flashcards.length !== 1 ? 's' : ''})
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Quiz in progress / complete
  return (
    <div className="w-full h-screen bg-gray-900 text-gray-200 flex flex-col">
      {/* Header */}
      <header className="h-12 bg-gray-800 border-b border-gray-700 flex items-center px-4 shrink-0">
        <span className="text-lg font-bold text-white">DialogLab</span>
        <span className="text-gray-500 mx-2">|</span>
        <span className="text-sm text-blue-400">Quiz: {topic}</span>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-gray-400">
            {flashcards.length} cards
          </span>
          {isPlaying && (
            <button
              className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
              onClick={stopQuiz}
            >
              Stop
            </button>
          )}
          <button
            className="px-3 py-1 text-sm bg-gray-700 text-gray-300 rounded hover:bg-gray-600 transition-colors"
            onClick={resetQuiz}
          >
            New Quiz
          </button>
          {onExitQuiz && (
            <button
              className="px-3 py-1 text-sm bg-gray-700 text-gray-300 rounded hover:bg-gray-600 transition-colors"
              onClick={onExitQuiz}
            >
              Exit
            </button>
          )}
        </div>
      </header>

      {/* Main content */}
      <div className="flex overflow-hidden" style={{ height: 'calc(100vh - 48px)' }}>
        {/* Avatar scene area — explicit height so TalkingHead gets real pixel dimensions */}
        <div className="w-[60%] relative" style={{ height: 'calc(100vh - 48px)' }} ref={sceneContainerRef}>
          <div className="w-full h-full relative bg-gray-950">
            {scene.boxes.map((box) => {
              const { id, x, y, width, height, elements } = box;
              return (
                <div
                  key={id}
                  style={{
                    position: 'absolute',
                    left: `${x}%`,
                    top: `${y}%`,
                    width: `${width}%`,
                    height: `${height}%`,
                    borderRadius: '8px',
                    overflow: 'hidden',
                  }}
                >
                  {elements && elements.map((element) => {
                    if (element.elementType === 'avatar' && element.avatarData) {
                      const isSpeaking = currentSpeaker === element.avatarData.name;
                      return (
                        <div
                          key={element.id}
                          className="w-full h-full relative"
                        >
                          <div
                            id={`avatar-container-${element.id}`}
                            style={{
                              width: '100%',
                              height: '100%',
                              position: 'relative',
                              display: 'block',
                              overflow: 'hidden',
                              border: isSpeaking ? '2px solid #3b82f6' : '1px solid rgba(255,255,255,0.1)',
                              borderRadius: '8px',
                              transition: 'border-color 0.3s',
                            }}
                          />
                          {/* Avatar loading / error overlay */}
                          {avatarStatus === 'loading' && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-60 rounded-lg">
                              <div className="text-center">
                                <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                                <p className="text-gray-300 text-xs">Loading avatar...</p>
                              </div>
                            </div>
                          )}
                          {avatarStatus === 'error' && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-70 rounded-lg">
                              <div className="text-center p-3">
                                <p className="text-red-400 text-xs mb-1">Avatar failed to load</p>
                                <p className="text-gray-500 text-xs mb-2">{avatarError}</p>
                                <button
                                  className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                                  onClick={() => initializeScene()}
                                >
                                  Retry
                                </button>
                              </div>
                            </div>
                          )}
                          <div className="absolute bottom-2 left-0 right-0 text-center">
                            <span className={`px-2 py-0.5 rounded text-xs ${
                              isSpeaking ? 'bg-blue-600 text-white' : 'bg-black bg-opacity-60 text-gray-300'
                            }`}>
                              {element.avatarData.name}
                              {isSpeaking && ' (speaking...)'}
                            </span>
                          </div>
                        </div>
                      );
                    }

                    if (element.elementType === 'webcam') {
                      return (
                        <div
                          key={element.id}
                          className="w-full h-full relative"
                        >
                          <video
                            ref={webcamVideoRef}
                            autoPlay
                            playsInline
                            muted
                            className="w-full h-full object-cover"
                            style={{
                              borderRadius: '8px',
                              border: '1px solid rgba(255,255,255,0.1)',
                              transform: 'scaleX(-1)',
                            }}
                          />
                          <div className="absolute bottom-2 left-0 right-0 text-center">
                            <span className="px-2 py-0.5 rounded text-xs bg-black bg-opacity-60 text-gray-300">
                              {element.name || 'You'}
                            </span>
                          </div>
                        </div>
                      );
                    }

                    return null;
                  })}
                </div>
              );
            })}

            {/* Loading overlay */}
            {!isPlaying && messages.length === 0 && !conversationComplete && (
              <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
                <div className="text-center">
                  <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                  <p className="text-gray-300 text-sm">Initializing quiz...</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Chat panel */}
        <div className="w-[40%] border-l border-gray-700 flex flex-col" style={{ backgroundColor: '#1a1a2e' }}>
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {messages.length === 0 && !conversationComplete && (
              <p className="text-gray-500 text-sm text-center mt-8">
                Quiz is starting...
              </p>
            )}

            {messages.map((msg, index) => (
              <div
                key={index}
                className={`flex ${msg.isHuman ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] px-3 py-2 rounded-lg text-sm ${
                    msg.isHuman
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-700 text-gray-200'
                  }`}
                >
                  {!msg.isHuman && (
                    <div className="text-xs font-semibold text-blue-400 mb-1">
                      {msg.sender}
                    </div>
                  )}
                  <div>{msg.text}</div>
                </div>
              </div>
            ))}

            {conversationComplete && (
              <div className="text-center py-4 border-t border-gray-700 mt-4">
                <p className="text-green-400 font-semibold">Quiz Complete!</p>
                <p className="text-gray-400 text-sm mt-1">
                  Great job! You can start a new quiz or review the conversation above.
                </p>
                <button
                  className="mt-3 px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors"
                  onClick={resetQuiz}
                >
                  Start New Quiz
                </button>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input area */}
          {waitingForInput && (
            <div className="border-t border-gray-700 p-3">
              <div className="flex gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={humanInput}
                  onChange={(e) => setHumanInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && submitHumanInput()}
                  placeholder="Type your answer..."
                  className="flex-1 px-3 py-2 text-sm rounded border border-gray-600 bg-gray-800 text-gray-200 focus:border-blue-500 focus:outline-none"
                />
                <button
                  className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors disabled:opacity-50"
                  onClick={submitHumanInput}
                  disabled={!humanInput.trim()}
                >
                  Send
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">Press Enter to submit your answer</p>
            </div>
          )}

          {!waitingForInput && isPlaying && (
            <div className="border-t border-gray-700 p-3 text-center">
              <p className="text-sm text-gray-400 animate-pulse">
                {currentSpeaker} is speaking...
              </p>
            </div>
          )}

          {error && (
            <div className="border-t border-red-700 p-3">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SceneWrapper;

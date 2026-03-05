import { useEffect, useState } from 'react';
import Home from './components/Home';
import SceneWrapper from './components/quiz/SceneWrapper';
import { ThemeProvider } from './components/theme/ThemeContext';
import './components/theme/theme.css';
import './components/theme/theme-utils.css';
import './App.css';
import ApiKeyModal from './components/ApiKeyModal';

function App() {
  const [missingKeys, setMissingKeys] = useState({ openai: false, gemini: false, tts: false });
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [provider, setProvider] = useState('gemini');

  // Check URL for quiz mode: ?mode=quiz
  const [appMode, setAppMode] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('mode') === 'quiz' ? 'quiz' : 'authoring';
  });

  const refreshStatus = async () => {
    // Compute missing keys locally (per-user)
    const p = localStorage.getItem('LLM_PROVIDER') || provider || 'gemini';
    setProvider(p);
    const nextMissing = {
      openai: p === 'openai' ? !(localStorage.getItem('OPENAI_API_KEY')) : false,
      gemini: p === 'gemini' ? !(localStorage.getItem('GEMINI_API_KEY')) : false,
      tts: !(localStorage.getItem('TTS_API_KEY')),
    };
    setMissingKeys(nextMissing);
    setShowKeyModal(nextMissing.openai || nextMissing.gemini || nextMissing.tts);
  };

  // Sync URL → appMode on mount (safety net for HMR / StrictMode)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('mode') === 'quiz') {
      setAppMode('quiz');
    }
  }, []);

  useEffect(() => {
    refreshStatus();
  }, []);

  useEffect(() => {
    const handler = () => setShowKeyModal(true);
    window.addEventListener('open-api-key-modal', handler);
    return () => window.removeEventListener('open-api-key-modal', handler);
  }, []);

  // Listen for quiz mode toggle events from Header
  useEffect(() => {
    const handleQuizMode = () => setAppMode('quiz');
    window.addEventListener('enter-quiz-mode', handleQuizMode);
    return () => window.removeEventListener('enter-quiz-mode', handleQuizMode);
  }, []);

  const handleExitQuiz = () => {
    setAppMode('authoring');
    // Update URL without reloading
    const url = new URL(window.location.href);
    url.searchParams.delete('mode');
    window.history.replaceState({}, '', url.toString());
  };

  return (
    <ThemeProvider>
      <div className="App">
        {appMode === 'quiz' ? (
          <SceneWrapper onExitQuiz={handleExitQuiz} />
        ) : (
          <Home />
        )}
        {showKeyModal && (
          <ApiKeyModal
            missing={missingKeys}
            provider={provider}
            onSelectProvider={(p) => {
              localStorage.setItem('LLM_PROVIDER', p);
              setProvider(p); // keep modal open; don't refresh/close here
            }}
            onClose={() => setShowKeyModal(false)}
            onSaved={refreshStatus}
          />
        )}
      </div>
    </ThemeProvider>
  );
}

export default App;
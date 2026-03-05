/**
 * Default scene configuration for the Quiz/Exam Prep wrapper.
 *
 * This creates a preloaded scene with an Examiner avatar and a Human (student)
 * so the user can immediately start practicing oral exams, interviews, or flashcard quizzes.
 */

const QUIZ_SCENE_ID = 'quiz-scene-default';

/**
 * Creates a default quiz scene with an examiner avatar and a human proxy student.
 * @param {Object} options - Optional overrides
 * @param {string} options.examinerName - Name for the examiner avatar
 * @param {string} options.studentName - Name for the student (human proxy)
 * @param {string} options.topic - Quiz topic
 * @param {string} options.backgroundImage - Optional background image URL
 * @returns {Object} A complete scene configuration
 */
export function createQuizScene(options = {}) {
  const {
    examinerName = 'Alice',
    studentName = 'You',
    topic = 'General Knowledge',
    backgroundImage = null,
  } = options;

  const examinerElementId = 'examiner-avatar-1';
  const studentElementId = 'student-avatar-1';

  return {
    id: QUIZ_SCENE_ID,
    name: `Quiz: ${topic}`,
    backgroundImage,
    hasUnsavedChanges: false,
    boxes: [
      {
        id: 'box-examiner',
        x: 5,
        y: 10,
        width: 40,
        height: 80,
        party: null,
        layoutMode: 'vertical',
        view: 'default',
        elementRatio: 1,
        elements: [
          {
            id: examinerElementId,
            elementType: 'avatar',
            avatarData: {
              id: examinerElementId,
              name: examinerName,
              gender: 'female',
              voice: 'en-GB-Standard-A',
              personality: 'professional and encouraging examiner',
              roleDescription: 'You are an examiner conducting an oral quiz. Ask questions from the provided flashcards one at a time. After the student answers, provide brief feedback on whether the answer is correct, then move on to the next question.',
              settings: {
                url: '/assets/female-avatar1.glb',
                body: 'F',
                cameraView: 'upper',
                cameraDistance: 0.5,
                cameraRotateY: 0,
                mood: 'neutral',
                ttsLang: 'en-GB',
                lipsyncLang: 'en',
                content: null,
                contentName: null,
                contentType: null,
                contentUrl: null,
              },
              url: '/assets/female-avatar1.glb',
            },
          },
        ],
      },
      {
        id: 'box-student',
        x: 55,
        y: 10,
        width: 40,
        height: 80,
        party: null,
        layoutMode: 'vertical',
        view: 'default',
        elementRatio: 1,
        elements: [
          {
            id: studentElementId,
            elementType: 'avatar',
            avatarData: {
              id: studentElementId,
              name: studentName,
              gender: 'male',
              voice: 'en-US-Standard-B',
              personality: 'student',
              roleDescription: 'Student answering quiz questions',
              settings: {
                url: '/assets/male-avatar1.glb',
                body: 'M',
                cameraView: 'upper',
                cameraDistance: 0.5,
                cameraRotateY: 0,
                mood: 'neutral',
                ttsLang: 'en-US',
                lipsyncLang: 'en',
                content: null,
                contentName: null,
                contentType: null,
                contentUrl: null,
              },
              url: '/assets/male-avatar1.glb',
            },
          },
        ],
      },
    ],
  };
}

/**
 * Creates the conversation config to send to /api/start-conversation
 * for a flashcard quiz session.
 * @param {Object} scene - The quiz scene object
 * @param {Array} flashcards - Array of {question, answer} objects
 * @param {Object} options - Additional options
 * @returns {Object} Server-ready conversation config
 */
export function createQuizConversationConfig(scene, flashcards = [], options = {}) {
  const {
    maxTurns = 50,
    examinerName = 'Alice',
    studentName = 'You',
  } = options;

  // Build the flashcard context for the conversation prompt
  let flashcardContext = '';
  if (flashcards.length > 0) {
    const flashcardList = flashcards
      .map((fc, i) => `  ${i + 1}. Q: ${fc.question} | A: ${fc.answer}`)
      .join('\n');
    flashcardContext = `You have the following flashcards to quiz the student on:\n${flashcardList}\n\nAsk these questions one at a time. After the student answers, tell them if they are correct or not, provide a brief explanation, then move to the next question. When all questions are done, give a summary of how they did.`;
  } else {
    flashcardContext = 'No flashcards have been loaded yet. Introduce yourself and tell the student to upload some flashcards to begin the quiz.';
  }

  return {
    scene,
    maxTurns,
    completeConversation: false,
    conversationMode: 'reactive',
    agents: [
      {
        name: examinerName,
        personality: 'professional, encouraging, and thorough examiner',
        interactionPattern: 'neutral',
        isHumanProxy: false,
        customAttributes: {},
        fillerWordsFrequency: 'none',
      },
      {
        name: studentName,
        personality: 'student',
        interactionPattern: 'neutral',
        isHumanProxy: true,
        customAttributes: {},
        fillerWordsFrequency: 'none',
      },
    ],
    participants: [examinerName, studentName],
    initiator: examinerName,
    topic: `Quiz session`,
    subTopic: '',
    conversationPrompt: flashcardContext,
    interactionPattern: 'neutral',
    turnTakingMode: 'round-robin',
    playAudio: true,
    playAnimation: true,
    partyMode: false,
    talkingHeadOptions: {
      enableAudio: true,
      enableAnimations: true,
      voiceOptions: {
        useElevenLabs: true,
        useBrowserTTS: false,
      },
      animationOptions: {
        syncWithAudio: true,
        expressiveness: 'medium',
      },
    },
  };
}

export { QUIZ_SCENE_ID };

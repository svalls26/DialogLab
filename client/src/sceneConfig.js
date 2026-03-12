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

  // Map examiner names to avatar configuration
  const EXAMINER_PRESETS = {
    Alice:  { gender: 'female', url: '/assets/female-avatar1.glb', body: 'F', voice: 'en-GB-Standard-A' },
    Grace:  { gender: 'female', url: '/assets/female-avatar2.glb', body: 'F', voice: 'en-GB-Standard-C' },
    Bob:    { gender: 'male',   url: '/assets/male-avatar1.glb',   body: 'M', voice: 'en-GB-Standard-B' },
    David:  { gender: 'male',   url: '/assets/male-avatar2.glb',   body: 'M', voice: 'en-US-Standard-B' },
    Henry:  { gender: 'male',   url: '/assets/male-avatar3.glb',   body: 'M', voice: 'en-US-Standard-D' },
  };

  const preset = EXAMINER_PRESETS[examinerName] || EXAMINER_PRESETS.Alice;
  const examinerElementId = 'examiner-avatar-1';
  const studentElementId = 'student-webcam-1';

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
              gender: preset.gender,
              voice: preset.voice,
              personality: 'professional and encouraging examiner',
              roleDescription: 'You are an examiner conducting an oral quiz. Ask questions from the provided flashcards one at a time. After the student answers, provide brief feedback on whether the answer is correct, then move on to the next question.',
              settings: {
                url: preset.url,
                body: preset.body,
                cameraView: 'upper',
                cameraDistance: 0.5,
                cameraRotateY: 0,
                mood: 'neutral',
                ttsLang: 'en-GB',
                lipsyncLang: 'en',
              },
              url: preset.url,
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
            elementType: 'webcam',
            name: studentName,
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
    flashcardContext = `You are conducting an oral interview/quiz. Here are the flashcards with questions and their correct answers:\n${flashcardList}\n\nIMPORTANT INSTRUCTIONS:\n1. Ask ONE question at a time from the flashcards above, in order.\n2. After the student answers, you MUST assess their answer by comparing it to the correct answer provided above. Specifically:\n   - Say whether the answer is correct, partially correct, or incorrect.\n   - Mention what the student got right.\n   - If something is missing or wrong, briefly explain the key point they missed (referencing the correct answer).\n3. Then move on to the NEXT question. Never re-ask a question that has already been asked.\n4. When all questions have been asked, give a short summary of their performance.\n\nCRITICAL: Look at the conversation history to see which questions you have already asked. Do NOT repeat any question. Always progress to the next unasked question.\n\nAlways follow this pattern: Ask question → Wait for answer → Assess answer with detailed feedback → Ask next question.\nNever skip the assessment step. Always reference the correct answer when giving feedback.`;
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
        roleDescription: 'You are an interviewer conducting an oral assessment. After every student answer, you MUST compare their response to the correct answer from your flashcards. Say whether they are correct or partially correct, acknowledge what they got right, mention any key details they missed from the full answer, and then move to the next question. Be encouraging but thorough. Never skip the assessment step.',
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
    topic: `Interview assessment based on flashcards`,
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

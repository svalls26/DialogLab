import React, { useState, useRef } from 'react';

/**
 * FlashcardUploader allows users to upload flashcards from CSV/JSON files
 * or add them manually for quiz sessions.
 *
 * CSV format: question,answer (one per line)
 * JSON format: [{ "question": "...", "answer": "..." }, ...]
 */
const FlashcardUploader = ({ flashcards, onFlashcardsChange }) => {
  const [manualQuestion, setManualQuestion] = useState('');
  const [manualAnswer, setManualAnswer] = useState('');
  const [error, setError] = useState('');
  const [editingIndex, setEditingIndex] = useState(null);
  const fileInputRef = useRef(null);

  const parseCSV = (text) => {
    const lines = text.split('\n').filter(line => line.trim());
    const cards = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Skip header row if it looks like one
      if (i === 0 && line.toLowerCase().includes('question') && line.toLowerCase().includes('answer')) {
        continue;
      }

      // Handle quoted CSV fields
      const match = line.match(/^"([^"]*(?:""[^"]*)*)"\s*,\s*"([^"]*(?:""[^"]*)*)"$/);
      if (match) {
        cards.push({
          question: match[1].replace(/""/g, '"'),
          answer: match[2].replace(/""/g, '"'),
        });
      } else {
        // Simple comma split (first comma separates question from answer)
        const commaIndex = line.indexOf(',');
        if (commaIndex > 0) {
          cards.push({
            question: line.substring(0, commaIndex).trim(),
            answer: line.substring(commaIndex + 1).trim(),
          });
        }
      }
    }

    return cards;
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setError('');
    const reader = new FileReader();

    reader.onload = (event) => {
      const text = event.target.result;

      try {
        let parsed;
        if (file.name.endsWith('.json')) {
          parsed = JSON.parse(text);
          if (!Array.isArray(parsed)) {
            throw new Error('JSON must be an array of {question, answer} objects');
          }
          parsed = parsed.filter(item => item.question && item.answer);
        } else {
          // Treat as CSV
          parsed = parseCSV(text);
        }

        if (parsed.length === 0) {
          setError('No valid flashcards found in the file. Expected CSV (question,answer) or JSON format.');
          return;
        }

        onFlashcardsChange([...flashcards, ...parsed]);
      } catch (err) {
        setError(`Failed to parse file: ${err.message}`);
      }
    };

    reader.readAsText(file);
    // Reset so the same file can be re-uploaded
    e.target.value = '';
  };

  const addManualCard = () => {
    if (!manualQuestion.trim() || !manualAnswer.trim()) {
      setError('Both question and answer are required.');
      return;
    }

    setError('');
    if (editingIndex !== null) {
      const updated = [...flashcards];
      updated[editingIndex] = { question: manualQuestion.trim(), answer: manualAnswer.trim() };
      onFlashcardsChange(updated);
      setEditingIndex(null);
    } else {
      onFlashcardsChange([...flashcards, { question: manualQuestion.trim(), answer: manualAnswer.trim() }]);
    }
    setManualQuestion('');
    setManualAnswer('');
  };

  const removeCard = (index) => {
    onFlashcardsChange(flashcards.filter((_, i) => i !== index));
    if (editingIndex === index) {
      setEditingIndex(null);
      setManualQuestion('');
      setManualAnswer('');
    }
  };

  const startEditing = (index) => {
    setEditingIndex(index);
    setManualQuestion(flashcards[index].question);
    setManualAnswer(flashcards[index].answer);
  };

  const cancelEditing = () => {
    setEditingIndex(null);
    setManualQuestion('');
    setManualAnswer('');
  };

  const clearAll = () => {
    onFlashcardsChange([]);
    setEditingIndex(null);
    setManualQuestion('');
    setManualAnswer('');
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Upload section */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors"
          onClick={() => fileInputRef.current?.click()}
        >
          Upload File
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.json,.txt"
          onChange={handleFileUpload}
          className="hidden"
        />
        <span className="text-xs text-gray-400">CSV (question,answer) or JSON</span>
        {flashcards.length > 0 && (
          <button
            className="px-2 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700 transition-colors ml-auto"
            onClick={clearAll}
          >
            Clear All ({flashcards.length})
          </button>
        )}
      </div>

      {error && (
        <p className="text-red-400 text-xs">{error}</p>
      )}

      {/* Manual entry */}
      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <label className="block text-xs text-gray-400 mb-1">Question</label>
          <input
            type="text"
            value={manualQuestion}
            onChange={(e) => setManualQuestion(e.target.value)}
            placeholder="Enter question..."
            className="w-full px-2 py-1.5 text-sm rounded border border-gray-600 bg-gray-800 text-gray-200 focus:border-blue-500 focus:outline-none"
            onKeyDown={(e) => e.key === 'Enter' && addManualCard()}
          />
        </div>
        <div className="flex-1">
          <label className="block text-xs text-gray-400 mb-1">Answer</label>
          <input
            type="text"
            value={manualAnswer}
            onChange={(e) => setManualAnswer(e.target.value)}
            placeholder="Enter answer..."
            className="w-full px-2 py-1.5 text-sm rounded border border-gray-600 bg-gray-800 text-gray-200 focus:border-blue-500 focus:outline-none"
            onKeyDown={(e) => e.key === 'Enter' && addManualCard()}
          />
        </div>
        <div className="flex gap-1">
          <button
            className="px-3 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700 transition-colors"
            onClick={addManualCard}
          >
            {editingIndex !== null ? 'Save' : 'Add'}
          </button>
          {editingIndex !== null && (
            <button
              className="px-2 py-1.5 bg-gray-600 text-white text-sm rounded hover:bg-gray-700 transition-colors"
              onClick={cancelEditing}
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Flashcard list */}
      {flashcards.length > 0 && (
        <div className="max-h-[250px] overflow-y-auto border border-gray-700 rounded">
          <table className="w-full text-sm">
            <thead className="bg-gray-800 sticky top-0">
              <tr>
                <th className="text-left px-2 py-1 text-gray-400 text-xs w-8">#</th>
                <th className="text-left px-2 py-1 text-gray-400 text-xs">Question</th>
                <th className="text-left px-2 py-1 text-gray-400 text-xs">Answer</th>
                <th className="px-2 py-1 text-gray-400 text-xs w-16"></th>
              </tr>
            </thead>
            <tbody>
              {flashcards.map((card, index) => (
                <tr
                  key={index}
                  className={`border-t border-gray-700 hover:bg-gray-800 ${
                    editingIndex === index ? 'bg-blue-900 bg-opacity-30' : ''
                  }`}
                >
                  <td className="px-2 py-1 text-gray-500 text-xs">{index + 1}</td>
                  <td className="px-2 py-1 text-gray-200">{card.question}</td>
                  <td className="px-2 py-1 text-gray-300">{card.answer}</td>
                  <td className="px-2 py-1 text-right">
                    <button
                      className="text-blue-400 hover:text-blue-300 text-xs mr-1"
                      onClick={() => startEditing(index)}
                      title="Edit"
                    >
                      Edit
                    </button>
                    <button
                      className="text-red-400 hover:text-red-300 text-xs"
                      onClick={() => removeCard(index)}
                      title="Remove"
                    >
                      X
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {flashcards.length === 0 && (
        <p className="text-gray-500 text-xs text-center py-4">
          No flashcards yet. Upload a file or add cards manually to begin.
        </p>
      )}
    </div>
  );
};

export default FlashcardUploader;

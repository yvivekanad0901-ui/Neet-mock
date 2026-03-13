
import { TestResult } from '../types';

const DB_NAME = 'NeetSmartEngineDB';
const STORE_NAME = 'testHistory';
const DB_VERSION = 1;

/**
 * Initializes the IndexedDB database.
 */
const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        // Create object store with 'id' as key path
        // This effectively makes it a collection of TestResult objects
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

/**
 * STRICT APPEND: Saves the full test result to persistent storage.
 * Uses 'add' to ensure we never overwrite an existing key.
 */
export const saveTestResult = async (result: TestResult): Promise<void> => {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      
      // SANITIZATION: Ensure object is pure JSON before storage to prevent DataCloneError
      // This strips undefined values and functions which can break IndexedDB
      const safeResult = JSON.parse(JSON.stringify(result));

      // CRITICAL: Use 'add' instead of 'put'. 
      // 'add' throws an error if the key already exists, strictly preventing overwrite.
      const request = store.add(safeResult);

      request.onsuccess = () => resolve();
      request.onerror = () => {
        console.error("Storage Error: Failed to append record. ID collision or Quota exceeded.", request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    console.error("Failed to save test result to DB:", error);
    throw error;
  }
};

/**
 * Retrieves summaries of all past tests using a CURSOR for memory efficiency.
 * We strip the heavy 'questions' array to keep the UI lightweight.
 */
export const getHistorySummaries = async (): Promise<TestResult[]> => {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const summaries: TestResult[] = [];
      
      // Use cursor to iterate instead of loading everything into memory at once
      const request = store.openCursor(null, 'prev'); // 'prev' sorts by key (id/timestamp) descending

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          const fullRecord = cursor.value as TestResult;
          // Extract everything EXCEPT questions and userAnswers for the summary list
          // This ensures the history list is fast even with 100+ tests
          const { questions, userAnswers, ...summary } = fullRecord;
          summaries.push(summary as TestResult);
          cursor.continue();
        } else {
          resolve(summaries);
        }
      };
      
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error("Failed to fetch history summaries:", error);
    return [];
  }
};

/**
 * Retrieves the FULL test result by ID for detailed review.
 * This fetches the complete object including the question list.
 */
export const getFullTestResult = async (id: string): Promise<TestResult | undefined> => {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(id);

      request.onsuccess = () => {
        if (request.result) {
            resolve(request.result);
        } else {
            console.warn(`Test ID ${id} not found in DB.`);
            resolve(undefined);
        }
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error(`Failed to fetch test details for ID ${id}:`, error);
    return undefined;
  }
};

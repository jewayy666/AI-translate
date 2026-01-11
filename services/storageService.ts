
import { HistoryItem } from '../types';

const DB_NAME = 'AudioTranscriberDB';
const STORE_NAME = 'history';

let dbPromise: Promise<IDBDatabase> | null = null;

/**
 * 取得資料庫連線（單例模式）
 */
export const getDB = (): Promise<IDBDatabase> => {
  if (dbPromise) return dbPromise;
  
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      dbPromise = null; // 重置以容許重試
      reject(request.error);
    };
  });
  
  return dbPromise;
};

export const saveItem = async (item: HistoryItem, audioBlob: Blob): Promise<void> => {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    
    // 移除暫時性的 URL 以節省存儲空間並避免序列化錯誤
    const { audioUrl, ...itemToSave } = item as any;
    
    const request = store.put({ ...itemToSave, audioBlob });
    
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
};

export const getAllItems = async (): Promise<(HistoryItem & { audioBlob: Blob })[]> => {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();
    
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
};

export const deleteItem = async (id: string): Promise<void> => {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    
    const request = store.delete(id);
    
    request.onsuccess = () => {
      // 成功發送刪除請求
    };
    
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(new Error("Transaction aborted"));
  });
};

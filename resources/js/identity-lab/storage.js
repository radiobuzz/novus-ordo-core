const DATABASE = 'novus.identity-lab.v1';
export function openShelf() {
    return new Promise((resolve, reject) => {
        let blocked = false;
        const request = indexedDB.open(DATABASE, 1);
        request.onupgradeneeded = () => request.result.createObjectStore('studies', { keyPath: 'id' });
        request.onerror = () => reject(request.error);
        request.onblocked = () => {
            blocked = true;
            reject(new Error('Storage blocked'));
        };
        request.onsuccess = () => {
            const db = request.result;
            if (blocked) {
                db.close();
                return;
            }
            db.onversionchange = () => db.close();
            resolve(db);
        };
    });
}
export function listStudies(db) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction('studies', 'readonly');
        const req = tx.objectStore('studies').getAll();
        tx.oncomplete = () => resolve(req.result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
    });
}
export function saveStudy(db, record) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction('studies', 'readwrite');
        const store = tx.objectStore('studies');
        let reason;
        const read = store.getAll();
        read.onsuccess = () => {
            if (read.result.length >= 8 && !read.result.some((r) => r.id === record.id)) {
                reason = new Error('shelfFull');
                tx.abort();
                return;
            }
            try {
                store.put(record);
            } catch (error) {
                reason = error;
                tx.abort();
            }
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(reason ?? tx.error);
        tx.onabort = () => reject(reason ?? tx.error);
    });
}
export function removeStudy(db, id) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction('studies', 'readwrite');
        tx.objectStore('studies').delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
    });
}

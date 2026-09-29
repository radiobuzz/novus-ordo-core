import { createMapModel } from './model.js';
import { exportMap, restoreMap } from './snapshot.js';
import { generateResources } from './resources.js';

self.onmessage = ({ data }) => {
    try {
        const model = data.snapshot
            ? restoreMap(data.snapshot)
            : createMapModel(data.cellCount, 'world', data.settings);
        generateResources(model, data.profiles);
        self.postMessage({ snapshot: exportMap(model) });
    } catch (error) {
        self.postMessage({ error: error.message });
    }
};

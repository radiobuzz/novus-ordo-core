import { createMapModel } from '../../resources/js/map/model.js';
import { exportMap } from '../../resources/js/map/snapshot.js';
process.stdout.write(JSON.stringify(exportMap(createMapModel())));

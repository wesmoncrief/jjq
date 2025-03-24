// import { Change } from "./jj";
import { Mono } from "./mono";

export interface ChangeNode {
  changeId: string;
  parents: string[];
  isHead: boolean;
  isImmutable: boolean;
}

export interface ChangePrefixes {
  changeId: string;
  prefix: string;
  lineBelow: string;
  isPrefixOnlyLine: false;
}

export interface PrefixOnly {
  prefix: string;
  isPrefixOnlyLine: true;
}

const EMPTY_LANE_IDENTIFIER = "empty_lane";

export function buildPrefixes(changes: ChangeNode[]): ChangePrefixes[] {
  const graph = mkGraph(changes);
  let lanes: string[] = [];
  const result: ChangePrefixes[] = [];
  for (const change of changes) {
    let laneIx;
    if (lanes.includes(change.changeId)) {
      laneIx = lanes.indexOf(change.changeId);
    } else {
      laneIx = lanes.length;
      lanes.push(change.changeId);
    }

    const prefixArray = [];
    for (let i = 0; i < lanes.length; ++i) {
      if (i === laneIx) {
        let sym = Mono.hollowDot;
        if (change.isImmutable) {
          sym = Mono.diamond;
        }
        if (change.isHead) {
          sym = Mono.dot;
        }
        prefixArray.push(sym);
      } else {
        const sym = lanes[i] === EMPTY_LANE_IDENTIFIER ? Mono.w : Mono.vertical;
        prefixArray.push(sym);
      }
      prefixArray.push(Mono.w);
    }
    const prefix = prefixArray.join("");
    if (change.parents.length > 2) {
      throw new Error("nyi - more than 2 parents");
    }
    const nextLanes = lanes.map((l) => l);
    nextLanes[laneIx] = EMPTY_LANE_IDENTIFIER;
    let insertTracker = 0;
    const insertLocations = [laneIx, lanes.length];
    function addNewParentLane(parentId: string) {
      const loc = insertLocations[insertTracker];
      nextLanes[loc] = parentId;
      insertTracker += 1;
    }
    for (const parent of change.parents) {
      // if not here, then it should get 'elided' away
      // TODO: do this with n=5, it wil show that we still need to reserve a parent track even if the parent doesnt' exist,
      // IF some future element might share the same parent
      // Actually, the way to solve this should include a topological sort (which is needed anyways)
        const parentLaneIx = lanes.indexOf(parent);
        if (parentLaneIx === -1) {
          addNewParentLane(parent);
      }
    }
    while (nextLanes[nextLanes.length - 1] === EMPTY_LANE_IDENTIFIER) {
      nextLanes.pop();
    }
    const drawingInput: number[][] = getDrawingInput(lanes, nextLanes, graph);
    const connectingLines = drawConnectingLane(drawingInput);
    const lineBelow = connectingLines.join(Mono.w);
    result.push({
      changeId: change.changeId,
      prefix: prefix,
      lineBelow: lineBelow,
      isPrefixOnlyLine: false,
    });
    lanes = nextLanes;
  }
  return result;
}
/*
a b 
| | c
| | /
  d

a
| \
b  c

[[0], [1], [1]]
*/

enum Connectors {
  unconnected = 0,
  down = 1,
  // not sure if we'll actually need this in real use-cases?
  horizontal = 3,
  // e.g. ─╯
  enterThenLeft = 4,
  enterThenRight = 5,
  leftThenExit = 6,
  rightThenExit = 7,
}

function getDrawingInput(
  lanes: string[],
  nextLanes: string[],
  graph: Map<string, { parents: string[]; children: string[] }>
) {
  const drawingInput: number[][] = [];
  for (let i = 0; i < lanes.length; ++i) {
    if (lanes[i] === EMPTY_LANE_IDENTIFIER) {
      drawingInput.push([]);
      continue;
    }
    const isDirectlyThere = nextLanes.includes(lanes[i]) && lanes[i];
    if (isDirectlyThere) {
      drawingInput.push([i]);
    } else {
      if (lanes[i] !== EMPTY_LANE_IDENTIFIER) {
        const parents = graph.get(lanes[i])?.parents!;
        const parentIxes = [];
        for (const p of parents) {
          parentIxes.push(nextLanes.indexOf(p));
        }
        drawingInput.push(parentIxes);
      }
    }
  }
  return drawingInput;
}

function drawConnectingLane(lanes: number[][]): string[] {
  const connections = computeConnections(lanes);
  return connections.map(getSymbol);
}

const mkKey = (arr: Connectors[]): string => {
  arr.sort();
  const key = arr.join("_");
  return key;
};
const map = {
  [mkKey([])]: Mono.w,
  [mkKey([Connectors.unconnected])]: Mono.train2,
  [mkKey([Connectors.down])]: Mono.vertical,
  [mkKey([Connectors.horizontal])]: Mono.horizontal,
  [mkKey([Connectors.enterThenLeft])]: Mono.cornerBottomRight,
  [mkKey([Connectors.enterThenRight])]: Mono.cornerBottomLeft,
  [mkKey([Connectors.leftThenExit])]: Mono.cornerTopLeft,
  [mkKey([Connectors.rightThenExit])]: Mono.cornerTopRight,

  [mkKey([Connectors.down, Connectors.enterThenLeft])]: Mono.train4,
  [mkKey([Connectors.down, Connectors.enterThenRight])]: Mono.train3,
  [mkKey([Connectors.down, Connectors.leftThenExit])]: Mono.train3,
  [mkKey([Connectors.down, Connectors.rightThenExit])]: Mono.train4,
  [mkKey([Connectors.down, Connectors.horizontal])]: Mono.train5,
};

function getSymbol(connectors: Set<Connectors>): string {
  const key = mkKey(Array.from(connectors));
  const symbol = map[key];
  if (symbol) {
    return symbol;
  }
  return Mono.darkGrey;
}
function computeConnections(lanes: number[][]): Set<Connectors>[] {
  let walkSize = 0;
  for (const l of lanes) {
    walkSize += l.length === 0 ? 1 : l.length;
  }
  const connections = new Array(walkSize)
    .fill(null)
    .map(() => new Set<Connectors>());
  for (let i = 0; i < lanes.length; ++i) {
    let topIx = i;
    for (const bottomIx of lanes[topIx]) {
      if (bottomIx === -1){
        connections[topIx].add(Connectors.unconnected);
        continue;
      }
      if (topIx === bottomIx) {
        connections[topIx].add(Connectors.down);
      }
      if (topIx < bottomIx) {
        connections[topIx].add(Connectors.enterThenRight);
        topIx += 1;
        while (topIx < bottomIx - 1) {
          connections[topIx].add(Connectors.horizontal);
          topIx += 1;
        }
        connections[topIx].add(Connectors.rightThenExit);
      }
      if (topIx > bottomIx) {
        connections[topIx].add(Connectors.enterThenLeft);
        topIx -= 1;
        while (topIx > bottomIx) {
          connections[topIx].add(Connectors.horizontal);
          topIx -= 1;
        }
        connections[topIx].add(Connectors.leftThenExit);
      }
    }
  }
  return connections;
}

function mkGraph(
  changes: ChangeNode[]
): Map<string, { parents: string[]; children: string[] }> {
  const nodes = new Map();
  for (const change of changes) {
    nodes.set(change.changeId, { parents: change.parents, children: [] });
  }
  for (const change of changes) {
    for (const parentId of change.parents) {
      if (nodes.has(parentId)) {
        const parent = nodes.get(parentId);
        parent.children.push(change.changeId);
      }
    }
  }

  return nodes;
}

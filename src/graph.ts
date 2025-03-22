import { Change } from "./jj";
import { Mono } from "./mono";

// Generates a prefix
// todo: elisions (between long parent & child chain), collapse lanes
export function buildPrefixGraph(changes: Change[]): ChangeWithPrefix[] {
  const graph = mkGraph(changes);
  let lanes: string[] = [];
  const result: ChangeWithPrefix[] = [];
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
        prefixArray.push(Mono.dot);
      } else {
        prefixArray.push(Mono.vertical);
      }
      prefixArray.push(Mono.w);
    }
    const prefix = prefixArray.join("");
    if (change.parents.length > 2) {
      throw new Error("nyi - more than 2 parents");
    }
    const nextLanes = lanes.map((l) => l);
    nextLanes[laneIx] = "empty column (no collapsing yet)";
    let insertTracker = 0;
    const insertLocations = [laneIx, lanes.length];
    function addNewParentLane(parentId: string) {
      const loc = insertLocations[insertTracker];
      nextLanes[loc] = parentId;
      insertTracker += 1;
    }
    for (const parent of change.parents) {
      const parentLaneIx = lanes.indexOf(parent);
      if (parentLaneIx === -1) {
        addNewParentLane(parent);
      }
    }
    const drawingInput: number[][] = [];
    for (let i = 0; i < lanes.length; ++i) {
      const isDirectlyThere = nextLanes.includes(lanes[i]);
      if (isDirectlyThere) {
        drawingInput.push([i]);
      } else {
        const parents = graph.get(lanes[i])?.parents!;
        const parentIxes = [];
        for (const p of parents) {
          parentIxes.push(nextLanes.indexOf(p));
        }
        drawingInput.push(parentIxes);
      }
    }
    const connectingLines = drawConnectingLane(drawingInput);
    const lineBelow = connectingLines.join(Mono.w);
    result.push({
      changeId: change.changeId,
      changeMessage: change.changeMessage,
      isEmpty: change.isEmpty,
      prefix: prefix,
      lineBelow: lineBelow,
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

function drawConnectingLane(lanes: number[][]): string[] {
  const connections = computeConnections(lanes);
  return connections.map(getSymbol);
}

function getSymbol(connectorSet: Set<Connectors>): string {
  const connectors = Array.from(connectorSet);

  if (connectors.length === 1) {
    const connection = connectors[0];
    switch (connection) {
      case Connectors.unconnected:
        return Mono.w;
      case Connectors.down:
        return Mono.vertical;
      case Connectors.horizontal:
        return Mono.horizontal;
      case Connectors.enterThenLeft:
        return Mono.cornerBottomRight;
      case Connectors.enterThenRight:
        return Mono.cornerBottomLeft;
      case Connectors.leftThenExit:
        return Mono.cornerTopLeft;
      case Connectors.rightThenExit:
        return Mono.cornerTopRight;
    }
  }
  return Mono.darkGrey;
}
function computeConnections(lanes: number[][]): Set<Connectors>[] {
  const connections = lanes.flat().map((l) => new Set<Connectors>());
  for (let i = 0; i < lanes.length; ++i) {
    let topIx = i;
    for (const bottomIx of lanes[topIx]) {
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
        while (topIx > bottomIx + 1) {
          connections[topIx].add(Connectors.horizontal);
          topIx -= 1;
        }
        connections[topIx].add(Connectors.leftThenExit);
      }
    }
  }
  return connections;
}

export interface ChangeWithPrefix {
  changeId: string;
  changeMessage: string;
  isEmpty: boolean;
  prefix: string;
  lineBelow: string;
}

function mkGraph(
  changes: Change[]
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

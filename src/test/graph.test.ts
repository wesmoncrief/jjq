// import { buildPrefixes } from "../graph";
// import { jestExpect as expect } from "mocha-expect-snapshot";

// describe("graph tests", () => {
//   it("case", () => {
//     const changes = [
//       {
//         changeId: "l",
//         changeMessage: "o",
//         isEmpty: false,
//         parents: ["o"],
//       },
//       {
//         changeId: "o",
//         changeMessage: "A b",
//         isEmpty: false,
//         parents: ["t"],
//       },
//       {
//         changeId: "ut",
//         changeMessage: "",
//         isEmpty: true,
//         parents: ["s"],
//       },
//       {
//         changeId: "s",
//         changeMessage: "merged",
//         isEmpty: false,
//         parents: ["w", "k"],
//       },
//       {
//         changeId: "w",
//         changeMessage: "mergedemo",
//         isEmpty: false,
//         parents: ["t"],
//       },
//       {
//         changeId: "p",
//         changeMessage: "A a a",
//         isEmpty: false,
//         parents: ["k"],
//       },
//       {
//         changeId: "uw",
//         changeMessage: "A a b",
//         isEmpty: false,
//         parents: ["k"],
//       },
//       {
//         changeId: "k",
//         changeMessage: "A a",
//         isEmpty: false,
//         parents: ["t"],
//       },
//       {
//         changeId: "t",
//         changeMessage: "A",
//         isEmpty: false,
//         parents: ["z"],
//       },
//       {
//         changeId: "z",
//         changeMessage: "",
//         isEmpty: true,
//         parents: [""],
//       },
//     ];
//     const prefixes = buildPrefixes(changes);
//     console.log(prefixes);
//     expect(prefixes).toMatchSnapshot();
//   });
// });

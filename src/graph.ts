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

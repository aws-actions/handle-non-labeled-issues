export interface ClassifyOptions {
    title: string;
    body: string;
    bugLabel: string;
    featureLabel: string;
    extraBugSignals: string[];
    extraFeatureSignals: string[];
    threshold: number;
}
export interface ClassifyResult {
    label: string | null;
    bugScore: number;
    frScore: number;
}
export declare function classify(options: ClassifyOptions): ClassifyResult;

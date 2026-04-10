export type ModelLimits = {
    context: number;
    output: number;
};
export declare function getLimits(modelId: string): ModelLimits;

export function getMin(arr: number[]): number {
    return arr.reduce((min, cur) => (cur < min ? cur : min), Infinity);
  }
  
  export function getMax(arr: number[]): number {
    return arr.reduce((max, cur) => (cur > max ? cur : max), -Infinity);
  }
  
declare module "papaparse" {
  export interface ParseError {
    message: string;
  }

  export interface ParseMeta {
    fields?: string[];
  }

  export interface ParseResult<T> {
    data: T[];
    errors: ParseError[];
    meta: ParseMeta;
  }

  export interface ParseConfig<T> {
    header?: boolean;
    skipEmptyLines?: boolean | "greedy";
    transformHeader?: (header: string) => string;
  }

  const Papa: {
    parse<T>(input: string, config?: ParseConfig<T>): ParseResult<T>;
  };

  export default Papa;
}

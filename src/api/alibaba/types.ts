export interface CategoryNode { name: string; code: string; categories?: CategoryNode[] }
export interface ApiEnvelope<T> { success: boolean; errorMsg?: string; errorCode?: string | number; content: T }
export interface RawJob {
  id: string | number; name: string; workLocations?: string[]; categories?: string[];
  categoryName?: string; department?: string; degree?: string; experience?: unknown;
  requirement?: string; description?: string; publishTime?: number; modifyTime?: number; positionUrl?: string;
  status?: unknown; code?: string; interviewLocations?: unknown; tags?: unknown;
  positionType?: unknown; project?: unknown;
}
export interface SearchContent { totalCount: number; currentPage: number; pageSize: number; datas: RawJob[] }
export interface SearchParams {
  keyword?: string; category?: string; subCategory?: string; regions?: string;
  deptCodes?: string[]; pageIndex?: number; pageSize?: number; language?: "zh";
}
export interface DetailParams { id: string; language?: "zh" }

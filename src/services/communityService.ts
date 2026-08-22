import API_ENDPOINTS from "@/config/api";
import type { Paginated } from "@/types/academics";
import type { CommunityPost, CommunityPostDetail, PostStatus, CommentStatus } from "@/types/community";
import { buildQuery, httpDelete, httpGet, httpPatch } from "./http";

export const listPosts = (
  { page = 1, limit = 20 }: { page?: number; limit?: number } = {},
) =>
  httpGet<Paginated<CommunityPost>>(
    API_ENDPOINTS.COMMUNITY.POSTS + buildQuery({ page, limit }),
  );

export const getPostDetail = (
  id: string,
  { page = 1, limit = 50 }: { page?: number; limit?: number } = {},
) =>
  httpGet<CommunityPostDetail>(
    API_ENDPOINTS.COMMUNITY.POST(id) + buildQuery({ page, limit }),
  );

export const updatePostStatus = (id: string, status: PostStatus) =>
  httpPatch<CommunityPost>(API_ENDPOINTS.COMMUNITY.POST(id), { status });

export const deletePost = (id: string) =>
  httpDelete<CommunityPost>(API_ENDPOINTS.COMMUNITY.POST(id));

export const updateCommentStatus = (id: string, status: CommentStatus) =>
  httpPatch(API_ENDPOINTS.COMMUNITY.COMMENT(id), { status });

export const deleteComment = (id: string) =>
  httpDelete(API_ENDPOINTS.COMMUNITY.COMMENT(id));

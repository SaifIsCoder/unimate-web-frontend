import type { Paginated } from "./academics";

export type PostStatus = "active" | "hidden" | "deleted";
export type CommentStatus = "active" | "hidden" | "deleted";

export type CommunityPost = {
  id: string;
  author_id: string;
  department_id: number;
  title: string;
  content: string;
  status: PostStatus;
  created_at: string;
  updated_at: string;
  
  // Joined fields
  author_email: string;
  author_role: string;
  like_count: string;
  comment_count: string;
};

export type CommunityComment = {
  id: string;
  post_id: string;
  author_id: string;
  content: string;
  status: CommentStatus;
  created_at: string;
  updated_at: string;
  
  // Joined fields
  author_email: string;
  author_role: string;
};

export type CommunityPostDetail = CommunityPost & {
  comments: Paginated<CommunityComment>;
};

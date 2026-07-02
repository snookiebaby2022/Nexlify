import { notFound } from "next/navigation";
import {
  ProblemSolutionBlogPage,
  problemSolutionMetadata,
} from "@/components/ProblemSolutionBlogPage";
import { PROBLEM_SOLUTION_POSTS, getProblemSolutionPost } from "@/lib/problem-solution-posts";

type PageProps = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return PROBLEM_SOLUTION_POSTS.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const post = getProblemSolutionPost(slug);
  if (!post) return {};
  return problemSolutionMetadata(post);
}

export default async function ProblemSolutionBlogRoute({ params }: PageProps) {
  const { slug } = await params;
  const post = getProblemSolutionPost(slug);
  if (!post) notFound();
  return <ProblemSolutionBlogPage post={post} />;
}

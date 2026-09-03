import { ProjectFeatureEntry, PROJECT_FEATURES, type ProjectEntrySearch } from '../_project-entry'

export const metadata = { title: PROJECT_FEATURES['scope'].title }

export default function ProjectEntryPage({ searchParams }: { searchParams: ProjectEntrySearch }) {
  return <ProjectFeatureEntry feature="scope" searchParams={searchParams} />
}

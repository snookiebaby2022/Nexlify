import { GroupEditForm } from "@/components/group-edit-form";

type Props = { params: Promise<{ id: string }> };

export default async function EditGroupPage({ params }: Props) {
  const { id } = await params;
  return <GroupEditForm groupId={id} title="Edit Group" manageLabel="Manage Groups" />;
}

defmodule FindThemApiWeb.JoinJSON do
  def preview(%{search: search}) do
    %{
      data: %{
        subject_type: search.subject_type,
        subject_name: search.subject_name,
        area: search.lkp_address
      }
    }
  end

  def created(%{volunteer: volunteer, token: token}) do
    %{
      data: %{
        id: volunteer.id,
        status: volunteer.status,
        name: volunteer.name,
        resource_type: volunteer.resource_type
      },
      token: token
    }
  end
end

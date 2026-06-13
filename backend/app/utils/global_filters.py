def get_global_filters(request):
    production_for = (
        request.query_params.get("production_for")
        or request.session.get("working_for")
    )

    location = (
        request.query_params.get("location")
        or request.query_params.get("peeling_at")
        or request.query_params.get("production_at")
        or request.session.get("working_at")
    )

    return production_for, location
// Replace the dataset and time window deliberately before running.
// Export as NDJSON. This query returns bounded operational fields only.
['croki-relay-traces-<stage>']
| where _time >= ago(30d)
| extend custom = column_ifexists('attributes.custom', dynamic({}))
| extend requestMethod = tostring(column_ifexists('attributes.http.request.method', ''))
| extend path = tostring(column_ifexists('attributes.url.path', ''))
| extend endpoint = tostring(column_ifexists('attributes.http.route', ''))
| extend statusCode = toint(column_ifexists('attributes.http.response.status_code', 0))
| extend userId = tostring(custom['user']['id'])
| extend environmentId = tostring(custom['relay']['environment_id'])
| extend errorType = tostring(custom['error']['type'])
| where isnotempty(userId)
| project _time, name, trace_id, span_id, requestMethod, path, endpoint, statusCode, userId, environmentId, errorType
| order by _time asc

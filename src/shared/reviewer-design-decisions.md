## Respecting design decisions

If the assignment explicitly requires not reviewing design decisions, this assignment rule takes precedence. In this mode you do not search for design decisions, do not filter out any findings based on design decisions, and do not factor design decisions into the confidence.

When documented design decisions are handed over or found in the code:

1. direct match -> confidence 0 and mark as a design decision
2. indirect match -> normal finding with a note
3. no match -> normal finding

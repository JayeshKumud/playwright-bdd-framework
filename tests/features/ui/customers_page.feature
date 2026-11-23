@ui
Feature: Customers page
  Users can find customers by name and add new customers. Names are made unique per scenario, so these
  scenarios can run in parallel and against shared environments.

  @smoke
  Scenario: Add a customer through the form
    When I add a customer named "Grace Hopper" through the form
    Then the customer can be found by id with status "active"
    And the customer appears in the customer list

  Scenario: Search shows a message when nothing matches
    When I search the customers page for a name that matches nobody
    Then the page says no customers were found

  Scenario: The grid shows this scenario's customers with their status
    Given these customers exist:
      | name          | status   |
      | Ada Lovelace  | active   |
      | Alan Turing   | inactive |
    When I search the customers page for this scenario's customers
    Then the grid column "Name" shows
      | Ada Lovelace |
      | Alan Turing  |
    And in the grid row where "Name" is "Alan Turing", "Status" is "inactive"
    And the page shows "Page 1 of 1"

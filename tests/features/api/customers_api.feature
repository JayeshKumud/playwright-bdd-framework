@api
Feature: Customers API
  Create, read, update and delete customers. Every customer a scenario creates is deleted after it.

  @smoke
  Scenario: Create a customer
    When I create a customer named "Ada Lovelace" through the API
    Then the API responds with status 201
    And the response contains that customer with status "active"

  Scenario: Read a customer
    Given a customer named "Alan Turing" exists
    When I get that customer through the API
    Then the API responds with status 200
    And the response contains that customer with status "active"

  Scenario: Change a customer's status
    Given a customer named "Grace Hopper" exists
    When I change the status of that customer to "inactive"
    Then the customer can be found by id with status "inactive"

  Scenario: Delete a customer
    Given a customer named "Katherine Johnson" exists
    When I delete that customer through the API
    Then the API responds with status 204
    And that customer no longer exists

  Scenario: An unknown customer is not found
    When I get the customer with id 999999999 through the API
    Then the API responds with status 404
    And the response error says "Customer not found"

  Scenario: A customer needs an email
    When I create a customer without an email through the API
    Then the API responds with status 422
